import { getNextTask, completeTask, failTask } from "../tasks/task.queue";
import { executeTask } from "../tasks/task.executor";
import type { AgentTask } from "../types/task.types";

async function startWorker() {
  while (true) {
    let task: AgentTask | null = null;

    try {
      task = await getNextTask();

      if (!task) {
        await sleep(2000);
        continue;
      }

      const result = await executeTask(task);

      await completeTask(task.id, result, task);
    } catch (err: any) {
      console.error("Worker error:", err);
      if (task) {
        await failTask(task.id, err.message, task);
      }
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

startWorker();
