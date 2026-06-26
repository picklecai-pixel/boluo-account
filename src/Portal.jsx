import { useMemo, useState } from 'react';
import './portal.css';

const DEFAULT_SPARK_URL = 'http://192.168.31.70:3000';
const SPARK_URL_KEY = 'boluoSparkUrl';
const text = {
  "hub": "\u83e0\u841d\u5de5\u4f5c\u53f0",
  "title": "\u83e0\u841d\u5305\u70e4\u7bb1",
  "subtitle": "\u8fdb\u5165\u83e0\u841d\u8d26\u6237\u7ba1\u7406\u6536\u652f\uff0c\u4e5f\u53ef\u4ee5\u5728\u65c1\u8fb9\u8fde\u63a5 DGX Spark \u4e0a\u7684 Qwen\u3002",
  "account": "\u8fdb\u5165\u8bb0\u8d26",
  "openSpark": "\u6253\u5f00 Spark",
  "statusLabel": "\u5de5\u4f5c\u53f0\u72b6\u6001",
  "ledger": "\u8d26\u672c",
  "sync": "Firebase \u540c\u6b65",
  "ai": "AI",
  "qwen": "Qwen \u672c\u5730\u6a21\u578b",
  "entry": "\u5165\u53e3",
  "onePage": "\u4e00\u9875\u5207\u6362",
  "boluo": "\u83e0\u841d\u8d26\u6237",
  "enter": "\u8fdb\u5165",
  "accountDesc": "\u7ee7\u7eed\u4f7f\u7528\u539f\u6765\u7684\u6536\u5165\u652f\u51fa\u3001\u6708\u4efd\u7b5b\u9009\u3001\u56fe\u8868\u7edf\u8ba1\u548c\u5fae\u4fe1\u8d26\u5355\u5bfc\u5165\u3002",
  "feature1": "\u6536\u652f\u8bb0\u5f55",
  "feature2": "\u4e91\u7aef\u540c\u6b65",
  "feature3": "\u8d26\u5355\u5bfc\u5165",
  "feature4": "\u56fe\u8868\u5206\u6790",
  "qwenWindow": "Qwen \u804a\u5929\u7a97\u53e3",
  "refresh": "\u5237\u65b0",
  "newWindow": "\u65b0\u7a97\u53e3",
  "sparkUrl": "Spark \u5730\u5740",
  "save": "\u4fdd\u5b58",
  "embedBlocked": "\u4f60\u7684 Spark \u5df2\u7ecf\u5728\u5c40\u57df\u7f51\u53ef\u8bbf\u95ee\uff0c\u4f46 GitHub Pages \u662f HTTPS\uff0c\u6d4f\u89c8\u5668\u4e0d\u5141\u8bb8\u5b83\u76f4\u63a5\u5d4c\u5165 HTTP \u7684 Spark \u7a97\u53e3\u3002\u70b9\u4e0b\u9762\u6309\u94ae\u4f1a\u5728\u65b0\u7a97\u53e3\u6253\u5f00\u804a\u5929\u9875\u3002",
  "openSparkChat": "\u6253\u5f00 Spark \u804a\u5929"
};

function normalizeUrl(value) {
  return value.trim().replace(/\/+$/, '');
}

function Portal() {
  const [sparkUrl, setSparkUrl] = useState(() => localStorage.getItem(SPARK_URL_KEY) || DEFAULT_SPARK_URL);
  const [frameKey, setFrameKey] = useState(0);

  const activeSparkUrl = useMemo(() => normalizeUrl(sparkUrl) || DEFAULT_SPARK_URL, [sparkUrl]);
  const blocksEmbed = window.location.protocol === 'https:' && activeSparkUrl.startsWith('http://');

  function saveSparkUrl() {
    localStorage.setItem(SPARK_URL_KEY, activeSparkUrl);
    setSparkUrl(activeSparkUrl);
    setFrameKey((value) => value + 1);
  }

  function openSpark() {
    window.open(activeSparkUrl, '_blank', 'noopener,noreferrer');
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

        <div className="portal-status-grid" aria-label={text.statusLabel}>
          <div>
            <span>{text.ledger}</span>
            <strong>{text.sync}</strong>
          </div>
          <div>
            <span>{text.ai}</span>
            <strong>{text.qwen}</strong>
          </div>
          <div>
            <span>{text.entry}</span>
            <strong>{text.onePage}</strong>
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
              <button type="button" className="ghost-button small-button" onClick={() => setFrameKey((value) => value + 1)}>
                {text.refresh}
              </button>
              <button type="button" className="ghost-button small-button" onClick={openSpark}>
                {text.newWindow}
              </button>
            </div>
          </div>

          <label className="spark-url-label" htmlFor="spark-url">
            {text.sparkUrl}
            <span className="spark-url-row">
              <input
                id="spark-url"
                type="url"
                value={sparkUrl}
                onChange={(event) => setSparkUrl(event.target.value)}
                placeholder={DEFAULT_SPARK_URL}
              />
              <button type="button" className="primary-button" onClick={saveSparkUrl}>
                {text.save}
              </button>
            </span>
          </label>

          <div className="spark-frame">
            {blocksEmbed ? (
              <div className="spark-frame-message">
                <p>{text.embedBlocked}</p>
                <button type="button" className="primary-button spark-open-button" onClick={openSpark}>
                  {text.openSparkChat}
                </button>
              </div>
            ) : (
              <iframe
                key={activeSparkUrl + '-' + frameKey}
                src={activeSparkUrl}
                title="DGX Spark Qwen"
                referrerPolicy="no-referrer"
                allow="clipboard-read; clipboard-write"
              />
            )}
          </div>
        </article>
      </section>
    </main>
  );
}

export default Portal;
