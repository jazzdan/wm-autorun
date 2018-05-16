import path = require('path');
import vscode = require('vscode');
import { getToolsEnvVars, resolvePath, runTool, ICheckResult, getWorkspaceFolderPath } from './util';
import { outputChannel } from './goStatus';
import { diagnosticsStatusBarItem } from './goStatus';

/**
 * Runs linter and presents the output in the 'Go' channel and in the diagnostic collections.
 *
 * @param fileUri Document uri.
 * @param goConfig Configuration for the Go extension.
 * @param lintWorkspace If true runs linter in all workspace.
 */
export function goLint(fileUri: vscode.Uri, goConfig: vscode.WorkspaceConfiguration, lintWorkspace?: boolean): Promise<ICheckResult[]> {
	if (running) {
		tokenSource.cancel();
	}

	const currentWorkspace = getWorkspaceFolderPath(fileUri);
	const cwd = (lintWorkspace && currentWorkspace) ? currentWorkspace : path.dirname(fileUri.fsPath);
	if (!path.isAbsolute(cwd)) {
		return Promise.resolve([]);
	}

	const lintTool = goConfig['lintTool'] || 'golint';
	const lintFlags: string[] = goConfig['lintFlags'] || [];
	const lintEnv = Object.assign({}, getToolsEnvVars());
	const args = [];
	const configFlag = '--config=';

	lintFlags.forEach(flag => {
		// --json is not a valid flag for golint and in gometalinter, it is used to print output in json which we dont want
		if (flag === '--json') {
			return;
		}
		if (flag.startsWith(configFlag)) {
			let configFilePath = flag.substr(configFlag.length);
			configFilePath = resolvePath(configFilePath);
			args.push(`${configFlag}${configFilePath}`);
			return;
		}
		args.push(flag);
	});
	if (lintTool === 'gometalinter') {
		if (args.indexOf('--aggregate') === -1) {
			args.push('--aggregate');
		}
		if (goConfig['toolsGopath']) {
			// gometalinter will expect its linters to be in the GOPATH
			// So add the toolsGopath to GOPATH
			lintEnv['GOPATH'] += path.delimiter + goConfig['toolsGopath'];
		}
	}

	if (lintWorkspace && currentWorkspace) {
		args.push('./...');
	}

	running = true;
	const lintPromise = runTool(
		args,
		cwd,
		'warning',
		false,
		lintTool,
		lintEnv,
		false,
		tokenSource.token
	).then((result) => {
		running = false;
		return result;
	});

	return lintPromise;
}

let tokenSource = new vscode.CancellationTokenSource();
let running = false;
