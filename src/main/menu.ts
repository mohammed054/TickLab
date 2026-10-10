// Minimal application menu: no dev tools in production, no remote content.
import { Menu, type MenuItemConstructorOptions } from 'electron';

export function buildMenu(h: { openDetail(): void; openDataFolder(): void; dev: boolean }): void {
  const view: MenuItemConstructorOptions[] = [{ label: 'Open Detail window', accelerator: 'Ctrl+D', click: h.openDetail }, { role: 'togglefullscreen' }];
  if (h.dev) view.push({ role: 'toggleDevTools' }, { role: 'reload' });
  const t: MenuItemConstructorOptions[] = [
    { label: 'File', submenu: [{ label: 'Open data folder', click: h.openDataFolder }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: view },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(t));
}
