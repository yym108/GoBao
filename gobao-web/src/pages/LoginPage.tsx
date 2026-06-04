import { AuthExperience } from '../components/AuthExperience';

/**
 * 登录页作为账户主入口，默认展示登录模式。
 */
export function LoginPage() {
  return <AuthExperience initialMode="login" />;
}
