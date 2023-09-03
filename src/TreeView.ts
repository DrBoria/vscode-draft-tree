
import * as vscode from 'vscode';
import { asPromise, createFolder, parseElement, updateCollapsed } from './utils';
import { ExclusiveHandle } from './event';
import { Disposable } from './lifecycle';
import { TreeDataProvider } from './TreeDataProvider';
import { File, Folder, TreeItemType } from './types';
import { WorkspaceState } from './WorkspaceState';

export class TabsView extends Disposable {
	private treeOpenedDataProvider: TreeDataProvider = this._register(new TreeDataProvider());
	private exclusiveHandle = new ExclusiveHandle();

	constructor() {
		super();

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

		// RENAME
		this._register(vscode.commands.registerCommand('tabsTreeOpenView.rename', (element: File | Folder ) => {
			vscode.window.showInputBox({ placeHolder: 'Type name here', value: element.label }).then(input => {
				if (input) {
					this.treeOpenedDataProvider.rename(element, input);
				}
			})
		}));

		// CLICK TO DIFFERENT ELEMENT
		this._register(openView.onDidChangeSelection(e => {
			if (e.selection.length > 0) {
				const item = e.selection[e.selection.length - 1];
				if (item.type === TreeItemType.File) {
					this.exclusiveHandle.run(() => asPromise(this.treeOpenedDataProvider.openFile(item)));
				}
			}
		}));

		// ADD TO OPEN
		this._register(vscode.commands.registerCommand('explorer.addToOpen', (element: vscode.Uri) => {
			const currentState = this.treeOpenedDataProvider.getState();

			// We have to update ID's if we need to keep different folder versions in one page
			const elementWithCustomIds = parseElement(element);
			this.treeOpenedDataProvider.setState([...currentState, elementWithCustomIds]);
		}));

		// CLOSE
		this._register(vscode.commands.registerCommand('tabsTreeOpenView.close', (element: File | Folder) => {
			this.treeOpenedDataProvider.deleteById(element.id);
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

		// EXPAND
		this._register(vscode.commands.registerCommand('tabsTreeOpenView.expandAll', () => {
			for (const item of this.treeOpenedDataProvider.getState()) {
				if (item.type === TreeItemType.Folder && item.children.length) {
					openView.reveal(item, {expand: true});
				}
			}

			const newState = this.treeOpenedDataProvider.getState();

			const updatedCollapsedState = updateCollapsed(newState, true);
			console.log(updatedCollapsedState);
		}));

		// Collapse
		this._register(vscode.commands.registerCommand('tabsTreeOpenView.collapseAll', () => vscode.commands.executeCommand('list.collapseAll')));

		// FILTER
		this._register(vscode.commands.registerCommand('tabsTreeOpenView.filter', () => {
			vscode.commands.executeCommand('list.find');
		}));

		// SAVE TO WORSPACE
		this._register(this.treeOpenedDataProvider.onDidChangeTreeData(() => this.saveState(this.treeOpenedDataProvider.getState())));
	}

	private saveState(state: Array<File | Folder>): void {
		WorkspaceState.setState(state);
	}
}
