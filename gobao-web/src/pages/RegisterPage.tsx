import { AuthExperience } from '../components/AuthExperience';

/**
 * 注册路由复用同一账户页面，仅以注册模式作为初始态。
 */
export function RegisterPage() {
  return <AuthExperience initialMode="register" />;
}
