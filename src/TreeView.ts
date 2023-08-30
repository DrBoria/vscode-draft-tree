
import * as vscode from 'vscode';
import { asPromise, createFolder, updateIds } from './utils';
import { ExclusiveHandle } from './event';
import { Disposable } from './lifecycle';
import { TreeDataProvider } from './TreeDataProvider';
import { File, Folder, TreeItemType } from './types';
import { WorkspaceState } from './WorkspaceState';
import { getFilePathTree } from './utils';

export class TabsView extends Disposable {
	private treeExplorerDataProvider: TreeDataProvider = this._register(new TreeDataProvider());
	private treeOpenedDataProvider: TreeDataProvider = this._register(new TreeDataProvider());
	private exclusiveHandle = new ExclusiveHandle();

	constructor(private workspaceRoot: string | undefined) {
		super();
		let initialState: Array<File | Folder> = [];

		if (workspaceRoot) {
			initialState = getFilePathTree(workspaceRoot);
		}

		// EXPLORER VIEW CREATION
		this.treeExplorerDataProvider.setState(initialState);
		const explorerView = this._register(vscode.window.createTreeView('tabsTreeExplorerView', {
			treeDataProvider: this.treeExplorerDataProvider,
			canSelectMany: true
		}));

		// OPENED VIEW CREATION
		const workspaceSavedState = WorkspaceState.getState() ?? [];
		this.saveState(workspaceSavedState);
		this.treeOpenedDataProvider.setState(workspaceSavedState);
		const openView = this._register(vscode.window.createTreeView('tabsTreeOpenView', {
			treeDataProvider: this.treeOpenedDataProvider,
			dragAndDropController: this.treeOpenedDataProvider,
			canSelectMany: true
		}));

		/* ******** PACK OF REGISTRED EVENTS START ******** */

		// EDIT
		this._register(this.treeOpenedDataProvider.onDidChangeTreeData(() => this.saveState(this.treeOpenedDataProvider.getState())));
		// RENAME
		this._register(vscode.commands.registerCommand('tabsTreeOpenView.rename', (element: File | Folder ) => {
			vscode.window.showInputBox({ placeHolder: 'Type name here', value: element.label }).then(input => {
				if (input) {
					this.treeOpenedDataProvider.rename(element, input);
				}
			})
		}));

		this._register(this.treeExplorerDataProvider)

		// CLICK TO DIFFERENT ELEMENT
		this._register(openView.onDidChangeSelection(e => {
			if (e.selection.length > 0) {
				const item = e.selection[e.selection.length - 1];
				if (item.type === TreeItemType.File) {
					this.exclusiveHandle.run(() => asPromise(this.treeOpenedDataProvider.openFile(item)));
				}
			}
		}));
		this._register(explorerView.onDidChangeSelection(e => {
			if (e.selection.length > 0) {
				const item = e.selection[e.selection.length - 1];
				if (item.type === TreeItemType.File) {
					this.exclusiveHandle.run(() => asPromise(this.treeExplorerDataProvider.openFile(item)));
				}
			}
		}));

		// ADD TO OPEN
		this._register(vscode.commands.registerCommand('tabsTreeExplorerView.addToOpen', (element: File | Folder) => {
			const currentState = this.treeOpenedDataProvider.getState();

			// We have to update ID's if we need to keep different folder versions in one page
			const elementWithCustomIds = updateIds(element);
			this.treeOpenedDataProvider.setState([...currentState, elementWithCustomIds]);
		}));

		// CLOSE
		this._register(vscode.commands.registerCommand('tabsTreeOpenView.close', (element: File | Folder) => {
			this.treeOpenedDataProvider.deleteById(element.id);
		}));

		// RESET
		this._register(vscode.commands.registerCommand('tabsTreeOpenView.reset', () => {
			WorkspaceState.setState([]);
			this.treeOpenedDataProvider.setState(initialState);
		}));

		// NEW FOLDER
		this._register(vscode.commands.registerCommand('tabsTreeOpenView.newFolder', () => {
			vscode.window.showInputBox({ placeHolder: 'Type name here' }).then(input => {
				if (input) {
					const currentState = this.treeOpenedDataProvider.getState();
					
					const folder = createFolder(input);

					this.treeOpenedDataProvider.setState([folder, ...currentState]);
				}
			})
		}));

		// FILTER
		this._register(vscode.commands.registerCommand('tabsTreeOpenView.filter', () => {
			vscode.commands.executeCommand('list.find');
		}))
	}

	private saveState(state: Array<File | Folder>): void {
		WorkspaceState.setState(state);
	}
}
