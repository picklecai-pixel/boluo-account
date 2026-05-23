import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { auth, db, hasFirebaseConfig, logOut, signInWithGoogle } from './firebase';

const today = new Date().toISOString().slice(0, 10);
const currentMonth = today.slice(0, 7);

const emptyForm = {
  type: 'expense',
  amount: '',
  category: '餐饮',
  date: today,
  note: '',
};

const categories = {
  income: ['工资', '奖金', '副业', '投资', '退款', '其他收入'],
  expense: ['餐饮', '交通', '购物', '住房', '娱乐', '医疗', '学习', '其他支出'],
};

const chartColors = ['#b86414', '#d39b2a', '#728f2d', '#a15c22', '#c47a2c', '#8f470b', '#a68a32', '#d97706'];

const currency = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 2,
});

const wechatExpenseRules = [
  ['餐饮', ['餐', '饭', '咖啡', '奶茶', '美团', '饿了么', '肯德基', '麦当劳', '星巴克', '外卖']],
  ['交通', ['滴滴', '打车', '出租', '地铁', '公交', '高铁', '火车', '机票', '加油', '停车']],
  ['购物', ['淘宝', '天猫', '京东', '拼多多', '超市', '便利店', '商店', '商城', '订单']],
  ['住房', ['房租', '物业', '水费', '电费', '燃气', '宽带']],
  ['娱乐', ['电影', '游戏', '腾讯视频', '爱奇艺', '网易云', '哔哩', '抖音', '快手']],
  ['医疗', ['医院', '药', '诊所', '体检', '医疗']],
  ['学习', ['课程', '教育', '书', '培训', '学习']],
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function cleanCell(value) {
  return String(value || '').replace(/^\uFEFF/, '').trim();
}

function columnIndex(headers, names) {
  return headers.findIndex((header) => names.some((name) => header.includes(name)));
}

function parseAmount(value) {
  const amount = Number(cleanCell(value).replace(/[¥￥,\s]/g, ''));
  return Number.isFinite(amount) ? amount : 0;
}

function parseDate(value) {
  const cleaned = cleanCell(value).replace(/\//g, '-');
  const matched = cleaned.match(/\d{4}-\d{1,2}-\d{1,2}/);

  if (!matched) {
    return '';
  }

  return matched[0]
    .split('-')
    .map((part, index) => (index === 0 ? part : part.padStart(2, '0')))
    .join('-');
}

function mapWechatCategory(type, text) {
  if (type === 'income') {
    return text.includes('退款') ? '退款' : '其他收入';
  }

  const rule = wechatExpenseRules.find(([, keywords]) =>
    keywords.some((keyword) => text.includes(keyword)),
  );

  return rule ? rule[0] : '其他支出';
}

function parseExcelRows(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error('Excel 文件里没有可读取的表格。');
  }

  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: '',
  });
}

async function readWechatRows(file) {
  const buffer = await file.arrayBuffer();
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    return parseExcelRows(buffer);
  }

  if (fileName.endsWith('.pdf')) {
    throw new Error('PDF 账单暂时不能自动导入，请在微信里导出 Excel 或 CSV 后上传。');
  }

  const utf8 = new TextDecoder('utf-8').decode(buffer);

  if (utf8.includes('交易时间') && utf8.includes('金额')) {
    return parseCsv(utf8);
  }

  try {
    const gbText = new TextDecoder('gb18030').decode(buffer);
    return parseCsv(gbText.includes('交易时间') ? gbText : utf8);
  } catch {
    return parseCsv(utf8);
  }
}

function parseWechatTransactions(rows) {
  const cleanRows = rows.filter((row) => row.some((cell) => cleanCell(cell)));
  const headerIndex = cleanRows.findIndex((row) => {
    const joined = row.map(cleanCell).join(',');
    return joined.includes('交易时间') && joined.includes('金额');
  });

  if (headerIndex < 0) {
    throw new Error('没有找到微信账单表头，请确认上传的是微信支付导出的 Excel 或 CSV 文件。');
  }

  const headers = cleanRows[headerIndex].map(cleanCell);
  const indexes = {
    date: columnIndex(headers, ['交易时间']),
    direction: columnIndex(headers, ['收/支', '收支']),
    amount: columnIndex(headers, ['金额']),
    counterparty: columnIndex(headers, ['交易对方']),
    product: columnIndex(headers, ['商品']),
    status: columnIndex(headers, ['当前状态', '交易状态']),
    transactionNo: columnIndex(headers, ['交易单号']),
    remark: columnIndex(headers, ['备注']),
  };

  if (indexes.date < 0 || indexes.direction < 0 || indexes.amount < 0) {
    throw new Error('账单缺少交易时间、收/支或金额列。');
  }

  return cleanRows.slice(headerIndex + 1).reduce((items, row) => {
    const direction = cleanCell(row[indexes.direction]);

    if (!direction.includes('收入') && !direction.includes('支出')) {
      return items;
    }

    const amount = parseAmount(row[indexes.amount]);
    const date = parseDate(row[indexes.date]);

    if (!amount || !date) {
      return items;
    }

    const type = direction.includes('收入') ? 'income' : 'expense';
    const counterparty = cleanCell(row[indexes.counterparty]);
    const product = cleanCell(row[indexes.product]);
    const status = cleanCell(row[indexes.status]);
    const remark = cleanCell(row[indexes.remark]);
    const transactionNo = cleanCell(row[indexes.transactionNo]);
    const description = [counterparty, product, remark].filter(Boolean).join(' · ');
    const category = mapWechatCategory(type, `${counterparty} ${product} ${remark} ${status}`);

    items.push({
      type,
      amount,
      category,
      date,
      note: description || '微信账单',
      source: 'wechat',
      sourceId: transactionNo || `${date}-${type}-${amount}-${description}`,
      sourceStatus: status,
    });

    return items;
  }, []);
}

function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [viewMode, setViewMode] = useState('month');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [importRows, setImportRows] = useState([]);
  const [importFileName, setImportFileName] = useState('');
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!hasFirebaseConfig) {
      setAuthReady(true);
      return undefined;
    }

    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setTransactions([]);
      return undefined;
    }

    const transactionsQuery = query(
      collection(db, 'transactions'),
      where('userId', '==', user.uid),
    );

    return onSnapshot(
      transactionsQuery,
      (snapshot) => {
        const nextTransactions = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) => b.date.localeCompare(a.date));
        setTransactions(nextTransactions);
      },
      (error) => {
        setStatus(`同步失败：${error.message}`);
      },
    );
  }, [user]);

  const selectedYear = selectedMonth.slice(0, 4);
  const periodLabel = viewMode === 'year' ? `${selectedYear} 全年` : selectedMonth;

  const periodTransactions = useMemo(
    () =>
      transactions.filter((item) =>
        viewMode === 'year'
          ? item.date?.startsWith(selectedYear)
          : item.date?.startsWith(selectedMonth),
      ),
    [transactions, selectedMonth, selectedYear, viewMode],
  );

  const summary = useMemo(() => {
    const income = periodTransactions
      .filter((item) => item.type === 'income')
      .reduce((sum, item) => sum + Number(item.amount), 0);
    const expense = periodTransactions
      .filter((item) => item.type === 'expense')
      .reduce((sum, item) => sum + Number(item.amount), 0);

    return {
      income,
      expense,
      balance: income - expense,
      count: periodTransactions.length,
    };
  }, [periodTransactions]);

  const monthlyAverage = useMemo(() => {
    const byMonth = new Map();

    transactions.forEach((item) => {
      if (!item.date) {
        return;
      }

      const month = item.date.slice(0, 7);
      const current = byMonth.get(month) || { income: 0, expense: 0 };
      current[item.type] += Number(item.amount) || 0;
      byMonth.set(month, current);
    });

    if (!byMonth.size) {
      return { income: 0, expense: 0, months: 0 };
    }

    const totals = [...byMonth.values()].reduce(
      (sum, item) => ({
        income: sum.income + item.income,
        expense: sum.expense + item.expense,
      }),
      { income: 0, expense: 0 },
    );

    return {
      income: totals.income / byMonth.size,
      expense: totals.expense / byMonth.size,
      months: byMonth.size,
    };
  }, [transactions]);

  const trendData = useMemo(() => {
    const byDate = new Map();

    periodTransactions.forEach((item) => {
      const key = viewMode === 'year' ? item.date.slice(0, 7) : item.date.slice(5);
      const current = byDate.get(key) || { date: key, income: 0, expense: 0 };
      current[item.type] += Number(item.amount);
      byDate.set(key, current);
    });

    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [periodTransactions, viewMode]);

  const categoryData = useMemo(() => {
    const byCategory = new Map();

    periodTransactions
      .filter((item) => item.type === 'expense')
      .forEach((item) => {
        byCategory.set(item.category, (byCategory.get(item.category) || 0) + Number(item.amount));
      });

    return [...byCategory.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [periodTransactions]);

  const importedSourceIds = useMemo(
    () =>
      new Set(
        transactions
          .filter((item) => item.source === 'wechat' && item.sourceId)
          .map((item) => item.sourceId),
      ),
    [transactions],
  );

  const importableRows = useMemo(
    () => importRows.filter((item) => !importedSourceIds.has(item.sourceId)),
    [importRows, importedSourceIds],
  );

  const importSummary = useMemo(() => {
    const income = importableRows
      .filter((item) => item.type === 'income')
      .reduce((sum, item) => sum + item.amount, 0);
    const expense = importableRows
      .filter((item) => item.type === 'expense')
      .reduce((sum, item) => sum + item.amount, 0);

    return {
      income,
      expense,
      total: importRows.length,
      duplicate: importRows.length - importableRows.length,
      importable: importableRows.length,
    };
  }, [importRows, importableRows]);

  function updateForm(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === 'type') {
        next.category = categories[value][0];
      }
      return next;
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const amount = Number(form.amount);

    if (!user) {
      setStatus('请先登录。');
      return;
    }

    if (!amount || amount <= 0) {
      setStatus('金额需要大于 0。');
      return;
    }

    setBusy(true);
    setStatus('');

    const payload = {
      type: form.type,
      amount,
      category: form.category.trim(),
      date: form.date,
      note: form.note.trim(),
      userId: user.uid,
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'transactions', editingId), payload);
        setStatus('已更新。');
      } else {
        await addDoc(collection(db, 'transactions'), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setStatus('已添加。');
      }

      setForm({ ...emptyForm, date: form.date, type: form.type, category: categories[form.type][0] });
      setEditingId(null);
    } catch (error) {
      setStatus(`保存失败：${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setForm({
      type: item.type,
      amount: String(item.amount),
      category: item.category,
      date: item.date,
      note: item.note || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setStatus('');
  }

  async function removeTransaction(id) {
    setBusy(true);
    setStatus('');
    try {
      await deleteDoc(doc(db, 'transactions', id));
      setStatus('已删除。');
    } catch (error) {
      setStatus(`删除失败：${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSignIn() {
    setBusy(true);
    setStatus('');
    try {
      await signInWithGoogle();
    } catch (error) {
      setStatus(`登录失败：${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setImportFileName(file.name);
    setImportError('');

    try {
      const rows = await readWechatRows(file);
      const parsed = parseWechatTransactions(rows);
      setImportRows(parsed);

      if (!parsed.length) {
        setImportError('没有识别到可导入的收支记录。');
      }
    } catch (error) {
      setImportRows([]);
      setImportError(error.message);
    }
  }

  function clearImport() {
    setImportRows([]);
    setImportFileName('');
    setImportError('');
  }

  async function confirmWechatImport() {
    if (!user || !importableRows.length) {
      return;
    }

    setImporting(true);
    setStatus('');
    setImportError('');

    try {
      for (let index = 0; index < importableRows.length; index += 450) {
        const batch = writeBatch(db);
        const chunk = importableRows.slice(index, index + 450);

        chunk.forEach((item) => {
          const transactionRef = doc(collection(db, 'transactions'));
          batch.set(transactionRef, {
            ...item,
            userId: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });

        await batch.commit();
      }

      setStatus(`已导入 ${importableRows.length} 笔微信账单。`);
      clearImport();
    } catch (error) {
      setImportError(`导入失败：${error.message}`);
    } finally {
      setImporting(false);
    }
  }

  if (!authReady) {
    return <div className="screen-message">正在加载...</div>;
  }

  if (!hasFirebaseConfig) {
    return <SetupScreen />;
  }

  if (!user) {
    return <SignInScreen onSignIn={handleSignIn} busy={busy} status={status} />;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">菠萝账户</p>
          <h1>看清每一笔收支</h1>
        </div>
        <div className="account">
          <span>{user.displayName || user.email}</span>
          <button type="button" className="ghost-button" onClick={() => logOut()}>
            退出
          </button>
        </div>
      </header>

      <section className="month-row" aria-label="时间范围筛选">
        <div className="segmented period-toggle" role="group" aria-label="查看范围">
          <button
            type="button"
            className={viewMode === 'month' ? 'active' : ''}
            onClick={() => setViewMode('month')}
          >
            月份
          </button>
          <button
            type="button"
            className={viewMode === 'year' ? 'active' : ''}
            onClick={() => setViewMode('year')}
          >
            全年
          </button>
        </div>
        <label htmlFor="month">{viewMode === 'year' ? '年份' : '月份'}</label>
        <input
          id="month"
          type={viewMode === 'year' ? 'number' : 'month'}
          min="2000"
          max="2100"
          value={viewMode === 'year' ? selectedYear : selectedMonth}
          onChange={(event) => {
            if (viewMode === 'year') {
              setSelectedMonth(`${event.target.value || selectedYear}-01`);
              return;
            }

            setSelectedMonth(event.target.value);
          }}
        />
      </section>

      <div className="workspace">
        <section className="entry-panel" aria-labelledby="entry-title">
          <div className="section-head">
            <h2 id="entry-title">{editingId ? '编辑账目' : '新增账目'}</h2>
            {editingId && (
              <button type="button" className="text-button" onClick={cancelEdit}>
                取消
              </button>
            )}
          </div>

          <form className="entry-form" onSubmit={handleSubmit}>
            <div className="segmented" role="group" aria-label="收支类型">
              <button
                type="button"
                className={form.type === 'expense' ? 'active' : ''}
                onClick={() => updateForm('type', 'expense')}
              >
                支出
              </button>
              <button
                type="button"
                className={form.type === 'income' ? 'active' : ''}
                onClick={() => updateForm('type', 'income')}
              >
                收入
              </button>
            </div>

            <label>
              金额
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.amount}
                onChange={(event) => updateForm('amount', event.target.value)}
                placeholder="0.00"
              />
            </label>

            <label>
              分类
              <select
                value={form.category}
                onChange={(event) => updateForm('category', event.target.value)}
              >
                {categories[form.type].map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label>
              日期
              <input
                type="date"
                value={form.date}
                onChange={(event) => updateForm('date', event.target.value)}
              />
            </label>

            <label>
              备注
              <input
                type="text"
                value={form.note}
                onChange={(event) => updateForm('note', event.target.value)}
                placeholder="可选"
                maxLength="60"
              />
            </label>

            <button type="submit" className="primary-button" disabled={busy}>
              {editingId ? '保存修改' : '添加账目'}
            </button>
          </form>

          {status && <p className="status">{status}</p>}
        </section>

        <section className="dashboard" aria-label="统计和图表">
          <section className="import-panel" aria-labelledby="import-title">
            <div className="section-head">
              <div>
                <h2 id="import-title">微信账单导入</h2>
                <p>上传微信支付导出的 Excel 或 CSV，确认后同步到账本。</p>
              </div>
              <label className="file-button">
                选择账单
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  onChange={handleImportFile}
                />
              </label>
            </div>

            {importFileName && <p className="import-file">已选择：{importFileName}</p>}
            {importError && <p className="status error">{importError}</p>}

            {importRows.length ? (
              <>
                <div className="import-summary">
                  <span>识别 {importSummary.total} 笔</span>
                  <span>可导入 {importSummary.importable} 笔</span>
                  <span>重复 {importSummary.duplicate} 笔</span>
                  <span>收入 {currency.format(importSummary.income)}</span>
                  <span>支出 {currency.format(importSummary.expense)}</span>
                </div>

                <div className="import-preview">
                  <table>
                    <thead>
                      <tr>
                        <th>日期</th>
                        <th>类型</th>
                        <th>分类</th>
                        <th>金额</th>
                        <th>备注</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.slice(0, 8).map((item, index) => (
                        <tr
                          key={`${item.sourceId}-${index}`}
                          className={importedSourceIds.has(item.sourceId) ? 'duplicate' : ''}
                        >
                          <td>{item.date}</td>
                          <td>{item.type === 'income' ? '收入' : '支出'}</td>
                          <td>{item.category}</td>
                          <td>{currency.format(item.amount)}</td>
                          <td>{item.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="import-actions">
                  <button type="button" className="ghost-button" onClick={clearImport}>
                    清空
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={confirmWechatImport}
                    disabled={importing || !importableRows.length}
                  >
                    {importing ? '正在导入...' : `导入 ${importSummary.importable} 笔`}
                  </button>
                </div>
              </>
            ) : (
              <p className="import-hint">在微信支付里导出 Excel 或 CSV 账单后，从这里选择文件即可预览。</p>
            )}
          </section>

          <div className="stats-grid">
            <Stat label="收入" value={currency.format(summary.income)} tone="income" />
            <Stat label="支出" value={currency.format(summary.expense)} tone="expense" />
            <Stat label="结余" value={currency.format(summary.balance)} tone="balance" />
            <Stat label="笔数" value={`${summary.count} 笔`} tone="count" />
            <Stat label="月均收入" value={currency.format(monthlyAverage.income)} tone="average-income" />
            <Stat label="月均支出" value={currency.format(monthlyAverage.expense)} tone="average-expense" />
          </div>

          <div className="charts-grid">
            <section className="chart-panel" aria-labelledby="trend-title">
              <h2 id="trend-title">收支趋势</h2>
              {trendData.length ? (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={trendData} margin={{ top: 12, right: 18, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#728f2d" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#728f2d" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#b86414" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#b86414" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} width={52} />
                    <Tooltip formatter={(value) => currency.format(value)} />
                    <Legend />
                    <Area type="monotone" dataKey="income" name="收入" stroke="#728f2d" fill="url(#incomeFill)" />
                    <Area type="monotone" dataKey="expense" name="支出" stroke="#b86414" fill="url(#expenseFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart text="这个月还没有账目" />
              )}
            </section>

            <section className="chart-panel" aria-labelledby="category-title">
              <h2 id="category-title">支出分类</h2>
              {categoryData.length ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={categoryData} dataKey="value" nameKey="name" outerRadius={84} label>
                      {categoryData.map((entry, index) => (
                        <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => currency.format(value)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart text="这个月还没有支出" />
              )}
            </section>
          </div>

          <section className="list-panel" aria-labelledby="list-title">
            <div className="section-head">
              <h2 id="list-title">账目明细</h2>
              <span>{periodLabel}</span>
            </div>

            {periodTransactions.length ? (
              <ul className="transaction-list">
                {periodTransactions.map((item) => (
                  <li key={item.id} className="transaction-item">
                    <div className={`type-dot ${item.type}`} />
                    <div className="transaction-main">
                      <strong>{item.category}</strong>
                      <span>{item.date}{item.note ? ` · ${item.note}` : ''}</span>
                    </div>
                    <div className={`amount ${item.type}`}>
                      {item.type === 'income' ? '+' : '-'}
                      {currency.format(Number(item.amount))}
                    </div>
                    <div className="item-actions">
                      <button type="button" onClick={() => startEdit(item)}>
                        编辑
                      </button>
                      <button type="button" onClick={() => removeTransaction(item.id)} disabled={busy}>
                        删除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-list">这个时间范围还没有记录。</div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className={`stat ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyChart({ text }) {
  return <div className="empty-chart">{text}</div>;
}

function SetupScreen() {
  return (
    <main className="setup-screen">
      <section className="setup-panel">
        <p className="eyebrow">菠萝账户</p>
        <h1>需要先配置 Firebase</h1>
        <p>
          复制 <code>.env.example</code> 为 <code>.env</code>，填入 Firebase Web App 配置后重新启动。
        </p>
        <ol>
          <li>在 Firebase Authentication 开启 Google 登录。</li>
          <li>创建 Cloud Firestore 数据库。</li>
          <li>把 <code>firestore.rules</code> 发布到 Firestore Rules。</li>
        </ol>
      </section>
    </main>
  );
}

function SignInScreen({ onSignIn, busy, status }) {
  return (
    <main className="signin-screen">
      <section className="signin-panel">
        <p className="eyebrow">菠萝账户</p>
        <h1>登录后开始记账</h1>
        <p>使用 Google 账号同步电脑和手机上的收入、支出与图表。</p>
        <button type="button" className="primary-button" onClick={onSignIn} disabled={busy}>
          使用 Google 登录
        </button>
        {status && <p className="status">{status}</p>}
      </section>
    </main>
  );
}

export default App;
