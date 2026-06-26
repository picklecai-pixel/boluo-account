import { useMemo, useState } from 'react';
import './portal.css';

const DEFAULT_SPARK_URL = 'https://fastest-context-dam-might.trycloudflare.com';
const DEFAULT_CHAT_API_URL = 'https://atomic-divide-telecom-retailers.trycloudflare.com/api/chat';
const SPARK_URL_KEY = 'boluoSparkUrl';
const CHAT_API_URL_KEY = 'boluoChatApiUrl';
const text = {
  hub: '菠萝工作台',
  title: '菠萝包烤箱',
  subtitle: '进入菠萝账户管理收支，也可以直接和 Spark 上的菠萝包AI聊天。',
  account: '进入记账',
  openSpark: '打开 Spark 管理页',
  boluo: '菠萝账户',
  enter: '进入',
  accountDesc: '继续使用原来的收入支出、月份筛选、图表统计和微信账单导入。',
  feature1: '收支记录',
  feature2: '云端同步',
  feature3: '账单导入',
  feature4: '图表分析',
  qwenWindow: '菠萝包AI',
  newWindow: '管理页',
  sparkUrl: 'Spark 管理页地址',
  save: '保存',
  chatApiUrl: '聊天接口地址',
  chatPlaceholder: '问菠萝包AI一个问题...',
  send: '发送',
  sending: '思考中...',
  clear: '清空',
  apiHint: '当前聊天通过 HTTPS 后端转发到 Spark 里的 Qwen，并带有简单限流。',
};

const starterMessages = [
  {
    role: 'assistant',
    content: '你好，我是菠萝包AI。你可以问我记账、消费分析、文件总结或日常问题。',
  },
];

function normalizeUrl(value) {
  return value.trim().replace(/\/+$/, '');
}

function Portal() {
  const [sparkUrl, setSparkUrl] = useState(() => {
    const savedUrl = localStorage.getItem(SPARK_URL_KEY);
    return savedUrl && !savedUrl.startsWith('http://192.168.31.70') ? savedUrl : DEFAULT_SPARK_URL;
  });
  const [chatApiUrl, setChatApiUrl] = useState(() => localStorage.getItem(CHAT_API_URL_KEY) || DEFAULT_CHAT_API_URL);
  const [messages, setMessages] = useState(starterMessages);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState('');

  const activeSparkUrl = useMemo(() => normalizeUrl(sparkUrl) || DEFAULT_SPARK_URL, [sparkUrl]);
  const activeChatApiUrl = useMemo(() => normalizeUrl(chatApiUrl) || DEFAULT_CHAT_API_URL, [chatApiUrl]);

  function saveSparkUrl() {
    localStorage.setItem(SPARK_URL_KEY, activeSparkUrl);
    localStorage.setItem(CHAT_API_URL_KEY, activeChatApiUrl);
    setSparkUrl(activeSparkUrl);
    setChatApiUrl(activeChatApiUrl);
  }

  function openSpark() {
    window.open(activeSparkUrl, '_blank', 'noopener,noreferrer');
  }

  async function sendMessage(event) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isSending) return;

    const nextMessages = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setDraft('');
    setIsSending(true);
    setChatError('');

    try {
      const response = await fetch(activeChatApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || data.error || '聊天接口暂时不可用。');
      }
      setMessages((current) => [...current, { role: 'assistant', content: data.reply || '模型没有返回内容。' }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : '聊天接口暂时不可用。';
      setChatError(message);
      setMessages((current) => [...current, { role: 'assistant', content: `连接菠萝包AI失败：${message}` }]);
    } finally {
      setIsSending(false);
    }
  }

  function clearChat() {
    setMessages(starterMessages);
    setChatError('');
  }

  return (
    <main className="portal-shell">
      <section className="portal-hero">
        <div className="portal-copy">
          <p className="eyebrow">{text.hub}</p>
          <h1>{text.title}</h1>
          <p>{text.subtitle}</p>
          <div className="portal-actions">
            <a className="primary-button portal-primary-link" href="#/account">
              {text.account}
            </a>
            <button type="button" className="ghost-button" onClick={openSpark}>
              {text.openSpark}
            </button>
          </div>
        </div>
      </section>

      <section className="portal-workspace">
        <article className="portal-panel account-portal-panel">
          <div className="portal-section-head">
            <div>
              <p className="eyebrow">Boluo Account</p>
              <h2>{text.boluo}</h2>
            </div>
            <a className="ghost-link" href="#/account">
              {text.enter}
            </a>
          </div>
          <p>{text.accountDesc}</p>
          <div className="portal-feature-list">
            <span>{text.feature1}</span>
            <span>{text.feature2}</span>
            <span>{text.feature3}</span>
            <span>{text.feature4}</span>
          </div>
        </article>

        <article className="portal-panel spark-portal-panel">
          <div className="portal-section-head">
            <div>
              <p className="eyebrow">DGX Spark</p>
              <h2>{text.qwenWindow}</h2>
            </div>
            <div className="portal-tool-buttons">
              <button type="button" className="ghost-button small-button" onClick={clearChat}>
                {text.clear}
              </button>
              <button type="button" className="ghost-button small-button" onClick={openSpark}>
                {text.newWindow}
              </button>
            </div>
          </div>

          <div className="spark-settings-grid">
            <label className="spark-url-label" htmlFor="spark-url">
              {text.sparkUrl}
              <input
                id="spark-url"
                type="url"
                value={sparkUrl}
                onChange={(event) => setSparkUrl(event.target.value)}
                placeholder={DEFAULT_SPARK_URL}
              />
            </label>
            <label className="spark-url-label" htmlFor="chat-api-url">
              {text.chatApiUrl}
              <span className="spark-url-row">
                <input
                  id="chat-api-url"
                  type="url"
                  value={chatApiUrl}
                  onChange={(event) => setChatApiUrl(event.target.value)}
                  placeholder={DEFAULT_CHAT_API_URL}
                />
                <button type="button" className="primary-button" onClick={saveSparkUrl}>
                  {text.save}
                </button>
              </span>
            </label>
          </div>
          <p className="chat-api-hint">{text.apiHint}</p>

          <div className="boluo-chat-box">
            <div className="boluo-chat-messages" aria-live="polite">
              {messages.map((message, index) => (
                <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
                  <span>{message.role === 'user' ? '你' : '菠萝包AI'}</span>
                  <p>{message.content}</p>
                </div>
              ))}
              {isSending ? (
                <div className="chat-message assistant pending">
                  <span>菠萝包AI</span>
                  <p>{text.sending}</p>
                </div>
              ) : null}
            </div>

            <form className="boluo-chat-form" onSubmit={sendMessage}>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={text.chatPlaceholder}
                rows={3}
              />
              <button type="submit" className="primary-button spark-open-button" disabled={isSending || !draft.trim()}>
                {isSending ? text.sending : text.send}
              </button>
            </form>
            {chatError ? <p className="chat-error">{chatError}</p> : null}
          </div>
        </article>
      </section>
    </main>
  );
}

export default Portal;
