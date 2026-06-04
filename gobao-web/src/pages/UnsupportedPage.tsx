import { PageTitle } from '../components/PageTitle';
import { PlaceholderModules } from '../components/PlaceholderModules';

export function UnsupportedPage() {
  return (
    <div className="page stack">
      <PageTitle
        title="后端未就绪模块"
        desc="实验指导书要求的功能比当前 Gateway 已开放接口更广。这里明确列出当前不能做真实联调的模块，避免演示时误认为已经可用。"
      />
      <PlaceholderModules />
    </div>
  );
}
