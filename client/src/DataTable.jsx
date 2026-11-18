import { useEffect, useState } from 'react';
import { apiFetch } from './api';

function DataTable({ columns, url, dataKey, reloadKey }) {
  const [length, setLength] = useState(10);
  const [pageNo, setPageNo] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [orderBy, setOrderBy] = useState('');
  const [order, setOrder] = useState('DESC');
  const [result, setResult] = useState({ total_counts: 0, listing_counts: 0, offset: 0 });

  // Ask the backend again whenever page, length, keyword or sort changes
  useEffect(() => {
    let cancelled = false;

    // Wait 300ms so we do not call the API on every key press
    const timer = setTimeout(async () => {
      const query = new URLSearchParams({
        offset: pageNo * length,
        length,
        keyword,
        order_by: orderBy,
        order,
      });
      const res = await apiFetch(`${url}?${query}`);
      const data = await res.json();
      if (cancelled) return;

      // If the last row of the last page was deleted, go back one page
      if (data.listing_counts === 0 && pageNo > 0) {
        setPageNo(pageNo - 1);
      } else {
        setResult(data);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [url, pageNo, length, keyword, orderBy, order, reloadKey]);

  const rows = result[dataKey] || [];
  const totalCounts = Number(result.total_counts) || 0;
  const offset = Number(result.offset) || 0;
  const listingCounts = offset + (Number(result.listing_counts) || 0);
  const pageCount = Math.ceil(totalCounts / length);

  const start = Math.max(0, pageNo - 2);
  const end = Math.min(pageCount - 1, pageNo + 2);
  const pages = [];
  for (let i = start; i <= end; i++) pages.push(i);

  function changeOrder(key) {
    if (!key) return;
    if (orderBy === key) {
      setOrder(order === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setOrderBy(key);
      setOrder('ASC');
    }
    setPageNo(0);
  }

  return (
    <div className="dataTables_wrapper no-footer">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <label>
          Show{' '}
          <select
            value={length}
            onChange={(e) => {
              setLength(Number(e.target.value));
              setPageNo(0);
            }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>{' '}
          entries
        </label>
        <label>
          Search:{' '}
          <input
            type="search"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPageNo(0);
            }}
          />
        </label>
      </div>

      <table className="table table-bordered table-hover align-middle" width="100%" cellPadding="8">
        <thead className="table-light">
          <tr style={{ textAlign: 'left' }}>
            {columns.map((col) => (
              <th
                key={col.label}
                onClick={() => changeOrder(col.key)}
                style={{ cursor: col.key ? 'pointer' : 'default' }}
              >
                {col.label}
                {col.key && orderBy === col.key ? (order === 'ASC' ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((col) => (
                <td key={col.label}>{col.render ? col.render(row) : row[col.key] ?? '-'}</td>
              ))}
            </tr>
          ))}
          {totalCounts === 0 && (
            <tr>
              <td colSpan={columns.length}>No entries found</td>
            </tr>
          )}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
        <div className="dataTables_info">
          Showing {totalCounts !== 0 ? offset + 1 : 0} to {listingCounts} of {totalCounts} entries
        </div>

        <div className="dataTables_paginate paging_simple_numbers" style={{ display: 'flex', gap: 4 }}>
          <button
            className="paginate_button previous"
            disabled={pageNo <= 0 || totalCounts === 0}
            onClick={() => setPageNo(pageNo - 1)}
          >
            Previous
          </button>

          {start > 0 && (
            <>
              <button className="paginate_button" onClick={() => setPageNo(0)}>1</button>
              {start > 1 && <span className="ellipsis">...</span>}
            </>
          )}

          {pages.map((i) => (
            <button
              key={i}
              className={`paginate_button ${pageNo === i ? 'current' : ''}`}
              onClick={() => setPageNo(i)}
            >
              {i + 1}
            </button>
          ))}

          {end < pageCount - 1 && (
            <>
              {end < pageCount - 2 && <span className="ellipsis">...</span>}
              <button className="paginate_button" onClick={() => setPageNo(pageCount - 1)}>
                {pageCount}
              </button>
            </>
          )}

          <button
            className="paginate_button next"
            disabled={pageNo + 1 >= pageCount || totalCounts === 0}
            onClick={() => setPageNo(pageNo + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

export default DataTable;