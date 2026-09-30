import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ScreenHeader } from '../components/ScreenHeader';
import { Money } from '../components/Money';
import { Icon } from '../components/Icon';
import { Field, MoneyInput, dangerBtn, inputCls, primaryBtn, secondaryBtn } from '../components/Form';
import { useToast } from '../components/Toast';
import { useAccounts, usePortfolio, useSectors } from '../data';
import { useGoBack } from '../hooks';
import { db } from '../../db/db';
import { InvestmentTrade as TradeSchema, Security as SecuritySchema, type InvestmentTrade, type Security } from '../../domain/schemas';
import { deleteSecurity, deleteTrade, saveSecurity, saveTrade, setFxRate, setPrice } from '../../services/investments';
import { ValidationError } from '../../services/entity';
import { formatScaled, latestFx, marketValue, parseScaled } from '../../calc/investments';
import { formatDisplayDate, todayIL } from '../../calc/dates';
import { formatAgorot, formatBp, parseAmountToAgorot } from '../../calc/money';
import { agorotToInput } from '../format';
import { he } from '../strings.he';

const I = he.invest;
const UNIT_SYMBOL: Record<Security['priceUnit'], string> = { ILS: '₪', ILA: 'אג׳', USD: '$' };

// ---------------------------------------------------------------------------
// Security: detail + edit
// ---------------------------------------------------------------------------

export function SecurityScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const goBack = useGoBack('/investments');
  const isNew = !id || id === 'new';
  const sectors = useSectors() ?? [];
  const p = usePortfolio();
  const trades = useLiveQuery(async () => (isNew ? [] : (await db.investmentTrades.where('securityId').equals(id!).filter((t) => !t.deletedAt).toArray()).sort((a, b) => b.date.localeCompare(a.date))), [id, isNew]);
  const [f, setF] = useState({ symbol: '', name: '', exchange: 'TASE' as Security['exchange'], type: 'stock' as Security['type'], sectorId: '', priceUnit: 'ILA' as Security['priceUnit'] });
  const [loaded, setLoaded] = useState(isNew);
  const [error, setError] = useState('');
  const set = (x: Partial<typeof f>) => setF((v) => ({ ...v, ...x }));

  useEffect(() => {
    if (isNew) return;
    void db.securities.get(id!).then((s) => {
      if (!s) return navigate('/investments', { replace: true });
      setF({ symbol: s.symbol, name: s.name, exchange: s.exchange, type: s.type, sectorId: s.sectorId ?? '', priceUnit: s.priceUnit });
      setLoaded(true);
    });
  }, [id, isNew, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      const saved = await saveSecurity(db, { symbol: f.symbol.trim().toUpperCase(), name: f.name.trim(), exchange: f.exchange, type: f.type, sectorId: f.sectorId || undefined, priceUnit: f.priceUnit }, isNew ? undefined : id);
      if (isNew) navigate(`/investments/security/${saved.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof ValidationError ? err.issues.map((i) => i.message).join(' · ') : he.common.errorGeneric);
    }
  }

  const pos = p?.positions.find((x) => x.security.id === id);
  if (!loaded) return <ScreenHeader title={I.editSecurity} back />;

  return (
    <>
      <ScreenHeader title={isNew ? I.addSecurity : f.symbol} back />
      <div className="flex flex-col gap-4 px-4 pb-8">
        {pos && (
          <section className="grid grid-cols-2 gap-3 rounded-card bg-brand p-5 text-sm text-on-brand">
            <div className="col-span-2">
              <p className="text-on-brand-muted">{I.value}</p>
              <Money agorot={pos.marketValue} className="text-3xl font-bold" />
              <p>
                <Money agorot={pos.unrealized} signed /> {pos.unrealizedBp !== null && <span className="num text-on-brand-muted">({formatBp(pos.unrealizedBp)})</span>}
              </p>
            </div>
            <div>
              <p className="text-on-brand-muted">{I.qty}</p>
              <p className="num font-medium">{formatScaled(pos.qty)}</p>
            </div>
            <div>
              <p className="text-on-brand-muted">{I.cost}</p>
              <Money agorot={pos.cost} className="font-medium" />
            </div>
            <div>
              <p className="text-on-brand-muted">{I.avgPrice}</p>
              {pos.avgPriceAgorot !== null ? <Money agorot={pos.avgPriceAgorot} className="font-medium" /> : '—'}
            </div>
            <div>
              <p className="text-on-brand-muted">{I.lastPrice}</p>
              <p className="num font-medium">{pos.price ? `${agorotToInput(pos.price.priceAgorot)} ${UNIT_SYMBOL[f.priceUnit]} · ${formatDisplayDate(pos.price.date)}` : I.noPrice}</p>
            </div>
            <div>
              <p className="text-on-brand-muted">{I.yield}</p>
              <p className="num font-medium">{pos.yieldBp !== null ? formatBp(pos.yieldBp) : '—'}</p>
            </div>
            <div>
              <p className="text-on-brand-muted">{I.yieldOnCost}</p>
              <p className="num font-medium">{pos.yieldOnCostBp !== null ? formatBp(pos.yieldOnCostBp) : '—'}</p>
            </div>
          </section>
        )}

        {!isNew && (
          <Link to={`/investments/trade/new?securityId=${id}`} className={primaryBtn}>
            <Icon name="plus" size={18} />
            {I.addTrade}
          </Link>
        )}

        {(trades ?? []).length > 0 && (
          <section>
            <h2 className="mb-2 px-1 text-sm font-medium text-muted">{I.trades}</h2>
            <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {(trades ?? []).map((t) => (
                <Link key={t.id} to={`/investments/trade/${t.id}`} className="flex min-h-12 items-center gap-3 px-4 py-2 text-sm">
                  <span className="num w-20 text-xs text-muted">{formatDisplayDate(t.date)}</span>
                  <span className="flex-1">
                    {I.tradeTypes[t.type]}
                    {t.quantity && <span className="num text-muted"> · {t.quantity}</span>}
                  </span>
                  <Money agorot={t.grossAgorot} />
                </Link>
              ))}
            </div>
          </section>
        )}

        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <h2 className="px-1 text-sm font-medium text-muted">{isNew ? '' : I.editSecurity}</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label={I.symbol}>{(p2) => <input {...p2} dir="ltr" className={inputCls} value={f.symbol} onChange={(e) => set({ symbol: e.target.value })} />}</Field>
            <Field label={I.exchange}>
              {(p2) => (
                <select {...p2} className={inputCls} value={f.exchange} onChange={(e) => set({ exchange: e.target.value as Security['exchange'], priceUnit: e.target.value === 'TASE' ? 'ILA' : 'USD' })}>
                  {SecuritySchema.shape.exchange.options.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
          <Field label={I.name}>{(p2) => <input {...p2} className={inputCls} value={f.name} onChange={(e) => set({ name: e.target.value })} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={I.type}>
              {(p2) => (
                <select {...p2} className={inputCls} value={f.type} onChange={(e) => set({ type: e.target.value as Security['type'] })}>
                  {SecuritySchema.shape.type.options.map((x) => (
                    <option key={x} value={x}>
                      {I.types[x]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={I.priceUnit}>
              {(p2) => (
                <select {...p2} className={inputCls} value={f.priceUnit} onChange={(e) => set({ priceUnit: e.target.value as Security['priceUnit'] })}>
                  {SecuritySchema.shape.priceUnit.options.map((x) => (
                    <option key={x} value={x}>
                      {I.units[x]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
          <Field label={I.sector}>
            {(p2) => (
              <select {...p2} className={inputCls} value={f.sectorId} onChange={(e) => set({ sectorId: e.target.value })}>
                <option value="">{I.noSector}</option>
                {sectors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {error && (
            <p role="alert" className="text-sm text-expense">
              {error}
            </p>
          )}
          <button type="submit" className={isNew ? primaryBtn : secondaryBtn}>
            {he.common.save}
          </button>
          {!isNew && (
            <button
              type="button"
              className={dangerBtn}
              onClick={async () => {
                try {
                  await deleteSecurity(db, id!);
                  goBack();
                } catch {
                  setError(I.trades);
                }
              }}
            >
              {he.common.delete}
            </button>
          )}
        </form>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Trade form
// ---------------------------------------------------------------------------

export function TradeFormScreen() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const goBack = useGoBack('/investments');
  const isNew = !id || id === 'new';
  const securities = useLiveQuery(() => db.securities.filter((s) => !s.deletedAt).sortBy('symbol'), []);
  const brokers = (useAccounts() ?? []).filter((a) => a.kind === 'brokerage' && a.status === 'active');
  const fxRates = useLiveQuery(() => db.fxRates.toArray(), []);
  const [existing, setExisting] = useState<InvestmentTrade>();
  const [loaded, setLoaded] = useState(isNew);
  const [f, setF] = useState({ securityId: params.get('securityId') ?? '', brokerageAccountId: '', type: 'buy' as InvestmentTrade['type'], date: todayIL(), quantity: '', price: '', gross: '', fee: '', tax: '', fx: '' });
  const [error, setError] = useState('');
  const set = (x: Partial<typeof f>) => setF((v) => ({ ...v, ...x }));

  useEffect(() => {
    if (isNew) return;
    void db.investmentTrades.get(id!).then((t) => {
      if (!t) return navigate('/investments', { replace: true });
      setExisting(t);
      setF({ securityId: t.securityId, brokerageAccountId: t.brokerageAccountId, type: t.type, date: t.date, quantity: t.quantity ?? '', price: agorotToInput(t.priceAgorotPerUnit), gross: agorotToInput(t.grossAgorot), fee: agorotToInput(t.feeAgorot), tax: agorotToInput(t.taxWithheldAgorot), fx: t.fxRate ?? '' });
      setLoaded(true);
    });
  }, [id, isNew, navigate]);

  const securityId = f.securityId || securities?.[0]?.id || '';
  const security = securities?.find((s) => s.id === securityId);
  const brokerageAccountId = f.brokerageAccountId || brokers[0]?.id || '';
  const needsQty = f.type === 'buy' || f.type === 'sell' || f.type === 'split';
  const fx = f.fx || (security?.priceUnit === 'USD' && fxRates ? (() => {
    const v = latestFx(fxRates, f.date);
    return v ? formatScaled(v) : '';
  })() : '');

  // Gross from quantity × price, in shekels (calc does the math; the user can override).
  const suggestedGross = useMemo(() => {
    const price = parseAmountToAgorot(f.price);
    if (!security || !price || !/^\d+(\.\d+)?$/.test(f.quantity)) return undefined;
    try {
      return marketValue(parseScaled(f.quantity), price, security.priceUnit, fx ? parseScaled(fx) : undefined);
    } catch {
      return undefined;
    }
  }, [f.price, f.quantity, security, fx]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (needsQty && !/^-?\d+(\.\d{1,6})?$/.test(f.quantity)) return setError(I.qtyError);
    const gross = f.gross.trim() ? parseAmountToAgorot(f.gross) : f.type === 'split' ? 0 : (suggestedGross ?? null);
    const fee = f.fee.trim() ? parseAmountToAgorot(f.fee) : undefined;
    const tax = f.tax.trim() ? parseAmountToAgorot(f.tax) : undefined;
    const price = f.price.trim() ? parseAmountToAgorot(f.price) : undefined;
    if (gross === null || fee === null || tax === null || price === null || gross < 0) return setError(he.txForm.errors.amount);
    const input = {
      brokerageAccountId,
      securityId,
      type: f.type,
      date: f.date,
      quantity: needsQty ? f.quantity : undefined,
      priceAgorotPerUnit: price ?? undefined,
      grossAgorot: gross,
      feeAgorot: fee ?? undefined,
      taxWithheldAgorot: tax ?? undefined,
      fxRate: security?.priceUnit === 'USD' && fx ? fx : undefined,
    };
    try {
      await saveTrade(db, input, existing?.id);
      if (security?.priceUnit === 'USD' && fx && f.fx) await setFxRate(db, fx, f.date);
      if (price && (f.type === 'buy' || f.type === 'sell')) await setPrice(db, securityId, price, f.date);
      goBack();
    } catch (err) {
      setError(err instanceof ValidationError ? err.issues.map((i) => i.message).join(' · ') : he.common.errorGeneric);
    }
  }

  if (!loaded || !securities) return <ScreenHeader title={I.editTrade} back />;
  if (!brokers.length)
    return (
      <>
        <ScreenHeader title={I.tradeTitle} back />
        <div className="flex flex-col gap-3 px-4">
          <p className="text-sm text-muted">{I.needBrokerage}</p>
          <Link to="/accounts/new" className={primaryBtn}>
            {he.home.addAccount}
          </Link>
        </div>
      </>
    );
  if (!securities.length)
    return (
      <>
        <ScreenHeader title={I.tradeTitle} back />
        <div className="px-4">
          <Link to="/investments/security/new" className={primaryBtn}>
            {I.addSecurity}
          </Link>
        </div>
      </>
    );

  return (
    <>
      <ScreenHeader title={existing ? I.editTrade : I.tradeTitle} back />
      <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 pb-8" noValidate>
        <Field label={I.security}>
          {(p) => (
            <select {...p} className={inputCls} value={securityId} onChange={(e) => set({ securityId: e.target.value })}>
              {securities.map((s) => (
                <option key={s.id} value={s.id}>
                  {`${s.symbol} · ${s.name}`}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={I.tradeType}>
          {(p) => (
            <select {...p} className={inputCls} value={f.type} onChange={(e) => set({ type: e.target.value as InvestmentTrade['type'] })}>
              {TradeSchema.shape.type.options.map((t) => (
                <option key={t} value={t}>
                  {I.tradeTypes[t]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={I.date}>{(p) => <input {...p} type="date" className={inputCls} value={f.date} onChange={(e) => set({ date: e.target.value })} />}</Field>
          <Field label={I.account}>
            {(p) => (
              <select {...p} className={inputCls} value={brokerageAccountId} onChange={(e) => set({ brokerageAccountId: e.target.value })}>
                {brokers.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        {needsQty && (
          <Field label={I.qty} hint={f.type === 'split' ? I.splitHint : undefined}>
            {(p) => <input {...p} inputMode="decimal" dir="ltr" className={`${inputCls} num text-start`} value={f.quantity} onChange={(e) => set({ quantity: e.target.value.trim() })} />}
          </Field>
        )}
        {(f.type === 'buy' || f.type === 'sell') && security && (
          <Field label={I.pricePerUnit(I.units[security.priceUnit])}>
            {(p) => <input {...p} inputMode="decimal" dir="ltr" className={`${inputCls} num text-start`} value={f.price} onChange={(e) => set({ price: e.target.value })} />}
          </Field>
        )}
        {security?.priceUnit === 'USD' && (
          <Field label={I.fx}>{(p) => <input {...p} inputMode="decimal" dir="ltr" className={`${inputCls} num text-start`} value={fx} onChange={(e) => set({ fx: e.target.value })} />}</Field>
        )}
        {f.type !== 'split' && (
          <Field label={I.gross} hint={suggestedGross !== undefined && !f.gross ? `${I.grossHint} ${formatAgorot(suggestedGross)}` : undefined}>
            {(p) => <MoneyInput {...p} value={f.gross} onChange={(gross) => set({ gross })} />}
          </Field>
        )}
        {(f.type === 'buy' || f.type === 'sell') && <Field label={I.fee}>{(p) => <MoneyInput {...p} value={f.fee} onChange={(fee) => set({ fee })} />}</Field>}
        {(f.type === 'sell' || f.type === 'dividend') && <Field label={I.taxWithheld}>{(p) => <MoneyInput {...p} value={f.tax} onChange={(tax) => set({ tax })} />}</Field>}
        {error && (
          <p role="alert" className="text-sm text-expense">
            {error}
          </p>
        )}
        <button type="submit" className={primaryBtn}>
          {he.common.save}
        </button>
        {existing && (
          <button
            type="button"
            className={dangerBtn}
            onClick={async () => {
              await deleteTrade(db, existing.id);
              goBack();
            }}
          >
            {he.common.delete}
          </button>
        )}
      </form>
    </>
  );
}

// ---------------------------------------------------------------------------
// Bulk price update
// ---------------------------------------------------------------------------

export function PricesScreen() {
  const goBack = useGoBack('/investments');
  const toast = useToast();
  const p = usePortfolio();
  const [date, setDate] = useState(todayIL());
  const [values, setValues] = useState<Record<string, string>>({});
  const [usd, setUsd] = useState('');
  const [error, setError] = useState('');
  const list = (p?.positions ?? []).filter((x) => x.qty > 0n);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const entries = Object.entries(values).filter(([, v]) => v.trim());
    for (const [, v] of entries) if (parseAmountToAgorot(v) === null) return setError(he.txForm.errors.amount);
    for (const [securityId, v] of entries) await setPrice(db, securityId, parseAmountToAgorot(v)!, date);
    if (usd.trim()) {
      if (!/^\d+(\.\d{1,6})?$/.test(usd.trim())) return setError(he.txForm.errors.amount);
      await setFxRate(db, usd.trim(), date);
    }
    toast({ message: I.saved });
    goBack();
  }

  return (
    <>
      <ScreenHeader title={I.pricesTitle} back />
      <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 pb-8" noValidate>
        <p className="text-sm text-muted">{I.pricesHint}</p>
        <Field label={I.date}>{(p2) => <input {...p2} type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        {list.some((x) => x.security.priceUnit === 'USD') && (
          <Field label={I.usdRate}>{(p2) => <input {...p2} inputMode="decimal" dir="ltr" className={`${inputCls} num text-start`} value={usd} onChange={(e) => setUsd(e.target.value)} />}</Field>
        )}
        <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {list.map((x) => (
            <label key={x.security.id} className="flex items-center gap-3 px-4 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{x.security.name}</span>
                <span className="block truncate text-right text-xs text-muted">{x.security.symbol}</span>
                <span className="num block truncate text-right text-xs text-muted">
                  {x.price ? `${agorotToInput(x.price.priceAgorot)} ${UNIT_SYMBOL[x.security.priceUnit]} · ${formatDisplayDate(x.price.date)}` : I.noPrice}
                </span>
              </span>
              <span className="w-28 shrink-0">
                <input
                  inputMode="decimal"
                  dir="ltr"
                  aria-label={`${x.security.name} ${I.lastPrice}`}
                  className={`${inputCls} num text-start`}
                  value={values[x.security.id] ?? ''}
                  onChange={(e) => setValues({ ...values, [x.security.id]: e.target.value })}
                />
              </span>
              <span className="w-6 shrink-0 text-xs text-muted">{UNIT_SYMBOL[x.security.priceUnit]}</span>
            </label>
          ))}
        </div>
        {error && (
          <p role="alert" className="text-sm text-expense">
            {error}
          </p>
        )}
        <button type="submit" className={primaryBtn}>
          {he.common.save}
        </button>
      </form>
    </>
  );
}
