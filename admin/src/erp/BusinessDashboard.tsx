import { Link } from 'react-router-dom';
import { Topbar } from '../Layout';
import { useApi } from '../hooks';
import { ErrorBox, Loading } from '../ui';
import { Kpi, rs, qty } from './common';

export default function BusinessDashboard() {
  const { data: d, error } = useApi<any>('/erp/dashboard');
  const max = d ? Math.max(1, ...d.trend.map((t: any) => Number(t.total))) : 1;
  return (
    <>
      <Topbar title="Business dashboard" />
      <ErrorBox msg={error} />
      {!d ? <Loading /> : (
        <div className="stack">
          <div className="grid g4">
            <Kpi label="Sales today" value={rs(d.sales_today)} sub={`${d.bills_today} bills · collected ${rs(d.collection_today)}`} />
            <Kpi label="Sales this month" value={rs(d.sales_month)} sub={`est. gross profit ${rs(d.gross_profit_month)}`} />
            <Kpi label="To receive (udhari)" value={rs(d.receivable)} sub={<span style={{ color: 'var(--red)' }}>{rs(d.overdue_receivable)} overdue</span>} />
            <Kpi label="To pay vendors" value={rs(d.payable)} sub={`purchase this month ${rs(d.purchase_month)}`} />
          </div>
          <div className="grid g4">
            <Kpi label="Cash in hand (app)" value={rs(d.cash_in_hand)} sub={`expenses this month ${rs(d.expense_month)}`} />
            <Kpi label="Stock value" value={rs(d.stock_value)} sub={<Link to="/erp/stock?low=1">{d.low_stock} items low on stock</Link>} />
            <Kpi label="Waiting your approval" value={<Link to="/erp/approvals">{d.pending_approvals}</Link>} tone={d.pending_approvals ? 'red' : undefined} />
            <Kpi label="Open work" value={d.pending_deliveries} sub={`deliveries · ${d.open_pos} POs · ${d.open_complaints} complaints${d.tally_pending ? ` · ${d.tally_pending} to Tally` : ''}`} />
          </div>
          <div className="grid g21">
            <div className="card">
              <h3>Sales · last 14 days</h3>
              {d.trend.length ? (
                <div className="bars">
                  {d.trend.map((t: any) => (
                    <div className="w" key={t.d} title={rs(t.total)}>
                      <div className="pair"><i style={{ height: `${(Number(t.total) / max) * 100}%` }} /></div>
                      <small>{new Date(t.d).getDate()}</small>
                    </div>
                  ))}
                </div>
              ) : <div className="empty">No sales yet</div>}
            </div>
            <div className="card">
              <h3>Payment promises today</h3>
              {d.promises_today.length ? d.promises_today.map((p: any, i: number) => (
                <div key={i} className="list-item between"><span>{p.name} <span className="muted">{p.mobile}</span></span><b>{rs(p.promise_amount)}</b></div>
              )) : <div className="empty">No promises due today</div>}
            </div>
          </div>
          <div className="card">
            <h3>Top products this month</h3>
            {d.top_products.length ? d.top_products.map((p: any) => (
              <div key={p.name} className="list-item between"><span>{p.name}</span><span>{qty(p.qty)} · <b>{rs(p.amount)}</b></span></div>
            )) : <div className="empty">No sales this month</div>}
          </div>
        </div>
      )}
    </>
  );
}
