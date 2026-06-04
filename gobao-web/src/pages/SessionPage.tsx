import { useEffect, useState } from 'react';
import { pingWithAuth } from '../api/auth';
import { useAuth } from '../auth/useAuth';
import { PageTitle } from '../components/PageTitle';
import { resolveApiErrorMessage } from '../lib/errors';

export function SessionPage() {
  const { isAuthenticated, session, user } = useAuth();
  const [pingResult, setPingResult] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setPingResult('');
      setError('');
      return;
    }

    setLoading(true);
    pingWithAuth()
      .then((data) => {
        setPingResult(`鉴权通过，pong=${String(data.pong)}，user_id=${data.user_id}`);
      })
      .catch((cause) => {
        setError(resolveApiErrorMessage(cause, '鉴权测试失败'));
      })
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  return (
    <div className="page stack">
      <PageTitle title="会话页" desc="用于快速确认 JWT 是否已持久化，并验证网关需要鉴权的 `/api/v1/ping` 接口。" />

      <section className="session-grid">
        <article className="card">
          <h3>本地会话状态</h3>
          <div className="stack">
            <div>是否已登录：{isAuthenticated ? '是' : '否'}</div>
            <div>当前用户：{user ? `${user.nickname} <${user.email}>` : '未登录'}</div>
            <div>access_token：{session?.access_token ? '已保存' : '未保存'}</div>
          </div>
        </article>

        <article className="card">
          <h3>网关鉴权测试</h3>
          {loading ? <div className="loading">正在请求 /api/v1/ping ...</div> : null}
          {pingResult ? <div className="status status--success">{pingResult}</div> : null}
          {error ? <div className="status status--error">{error}</div> : null}
          {!loading && !pingResult && !error ? (
            <div className="status status--info">未登录时不会主动调用鉴权测试接口。</div>
          ) : null}
        </article>
      </section>
    </div>
  );
}
