import { TaskAiComposer } from '../components/TaskAiComposer';
import { TaskCenterPage } from './TaskCenterPage';

export function TaskCenterWithAiPage() {
  return (
    <>
      <TaskCenterPage />
      <TaskAiComposer />
    </>
  );
}
