import * as fs from 'fs';
import * as vscode from 'vscode';
import { asPromise, createFolder, exportFile, parseElement, updateIds } from './utils';
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

		// CLICK TO DIFFERENT ELEMENT
		this._register(openView.onDidChangeSelection(e => {
			if (e.selection.length > 0) {
				const item = e.selection[e.selection.length - 1];
				if (item.type === TreeItemType.File) {
					this.exclusiveHandle.run(() => asPromise(this.treeOpenedDataProvider.openFile(item)));
				}
			}
		}));

		// RENAME
		this._register(vscode.commands.registerCommand('tabsTreeOpenView.rename', (element: File | Folder ) => {
			vscode.window.showInputBox({ placeHolder: 'Type name here', value: element.label }).then(input => {
				if (input) {
					this.treeOpenedDataProvider.rename(element, input);
				}
			})
		}));

		// ADD TO OPEN
		this._register(vscode.commands.registerCommand('explorer.addToOpen', (element: vscode.Uri) => {
			const currentState = this.treeOpenedDataProvider.getState();

			// We have to update ID's if we need to keep different folder versions in one page
			const elementWithCustomIds = parseElement(element);
			this.treeOpenedDataProvider.setState([...currentState, elementWithCustomIds]);
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

		// CLOSE
		this._register(vscode.commands.registerCommand('tabsTreeOpenView.close', (element: File | Folder) => {
			this.treeOpenedDataProvider.deleteById(element.id);
		}));

		// FILTER
		this._register(vscode.commands.registerCommand('tabsTreeOpenView.filter', () => {
			vscode.commands.executeCommand('list.find');
		}));

		// EXPORT
		this._register(vscode.commands.registerCommand('tabsTreeOpenView.export', (element: Folder) => {
			if (element.type === TreeItemType.Folder) {
				exportFile(element);
			}
		}));

		// IMPORT
		this._register(vscode.commands.registerCommand('tabsTreeOpenView.import', () => {
			let importedData;

			vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false }).then((uris: vscode.Uri[] | undefined) => {
				if (uris && uris.length > 0) {
					const filePath = uris[0].fsPath;
					// HERE we got JSON imported
					importedData = JSON.parse(fs.readFileSync(filePath).toString());

					if (importedData) {
						const currentState = this.treeOpenedDataProvider.getState();
						const importedWithUpdatedId = updateIds(importedData); // Required to set new id's to prevent duplicates
						this.treeOpenedDataProvider.setState([importedWithUpdatedId, ...currentState]);
					}
				}
			});
		}));

		// SAVE TO WORSPACE
		this._register(this.treeOpenedDataProvider.onDidChangeTreeData(() => this.saveState(this.treeOpenedDataProvider.getState())));


		// EXPAND
		this._register(vscode.commands.registerCommand('tabsTreeOpenView.expandAll', () => {
			this.expandAll(openView);
		}));
		// this._register(openView.onDidExpandElement((element) => {
		// 	if (element.element.type === TreeItemType.Folder) {
		// 		this.treeOpenedDataProvider.setCollapsedState(element.element, false);
		// 		this.saveState(this.treeDataProvider.getState());
		// 	}
		// }));
		
		// COLLAPSE
		this._register(vscode.commands.registerCommand('tabsTreeOpenView.collapseAll', () => vscode.commands.executeCommand('list.collapseAll')));
		// this._register(openView.onDidCollapseElement((element) => {
		// 	if (element.element.type === TreeItemType.Folder) {
		// 	this.treeOpenedDataProvider.setCollapsedState(element.element, true);
		// 	this.saveState(this.treeDataProvider.getState());
		// }}));
	}

	private saveState(state: Array<File | Folder>): void {
		WorkspaceState.setState(state);
	}

	private async expandAll(view: vscode.TreeView<vscode.TreeItem>) {
		const rootNodes = await this.treeOpenedDataProvider.getChildren();
		if (!rootNodes) return;

		for (const node of rootNodes) {
			await this.expandNode(view, node);
		}
	}
	
	private async expandNode(view: vscode.TreeView<vscode.TreeItem>, node: vscode.TreeItem) {
		await view.reveal(node, { expand: true });
	
		const children = await this.treeOpenedDataProvider.getChildren(node as any);
		if (!children) return;

		for (const child of children) {
			if (child.type === TreeItemType.Folder) await this.expandNode(view, child);
		}
	}
}
