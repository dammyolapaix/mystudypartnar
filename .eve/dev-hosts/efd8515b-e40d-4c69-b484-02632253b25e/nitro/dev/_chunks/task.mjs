import { fileURLToPath as __eveFileURLToPath } from "node:url";
import { dirname as __eveDirname } from "node:path";
const __filename = __eveFileURLToPath(import.meta.url);
__eveDirname(__filename);
import { HTTPError } from "file:///Users/dammyola/Projects/mystudypartnar/node_modules/.pnpm/h3@2.0.5_crossws@0.4.15_srvx@1.0.6__ocache@0.3.0/node_modules/h3/dist/_entries/node.mjs";
import "file:///Users/dammyola/Projects/mystudypartnar/node_modules/.pnpm/nitro@3.0.260903-beta/node_modules/nitro/dist/node_modules/croner/dist/croner.js";
//#region #nitro/virtual/tasks
const tasks = {};
//#endregion
//#region node_modules/.pnpm/nitro@3.0.260903-beta/node_modules/nitro/dist/runtime/internal/task.mjs
const __runningTasks__ = {};
async function runTask(name, { payload = {}, context = {} } = {}) {
	if (__runningTasks__[name]) return __runningTasks__[name];
	if (!(name in tasks)) throw new HTTPError({
		message: `Task \`${name}\` is not available!`,
		status: 404
	});
	if (!tasks[name].resolve) throw new HTTPError({
		message: `Task \`${name}\` is not implemented!`,
		status: 501
	});
	const handler = await tasks[name].resolve();
	const taskEvent = {
		name,
		payload,
		context
	};
	__runningTasks__[name] = handler.run(taskEvent);
	try {
		return await __runningTasks__[name];
	} finally {
		delete __runningTasks__[name];
	}
}
//#endregion
export { runTask, tasks };

//# sourceMappingURL=task.mjs.map