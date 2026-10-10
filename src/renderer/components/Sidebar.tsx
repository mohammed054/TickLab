import { NavLink } from 'react-router-dom';
import { Activity, BookOpen, FlaskConical, Radar, Settings, Star } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Tooltip } from './Tooltip';

export interface ScreenDef { path: string; title: string; icon: LucideIcon; shortcut: string }
export const SCREENS: ScreenDef[] = [
  { path: '/feed', title: 'Feed', icon: Radar, shortcut: 'Ctrl+1' },
  { path: '/watchlist', title: 'Watchlist', icon: Star, shortcut: 'Ctrl+2' },
  { path: '/journal', title: 'Journal', icon: BookOpen, shortcut: 'Ctrl+3' },
  { path: '/lab', title: 'Rules Lab', icon: FlaskConical, shortcut: 'Ctrl+4' },
  { path: '/health', title: 'Data Health', icon: Activity, shortcut: 'Ctrl+5' },
  { path: '/settings', title: 'Settings', icon: Settings, shortcut: 'Ctrl+6' },
];

/** 48px wide, 40x40 items with 20px icons; the active item has a 2px accent bar on the left. */
export function Sidebar() {
  return (
    <nav aria-label="Screens" style={{ width: 48, background: 'var(--bg-1)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4, gridRow: '1' }}>
      {SCREENS.map(({ path, title, icon: Icon, shortcut }) => (
        <Tooltip key={path} content={`${title} (${shortcut})`}>
          <NavLink to={path} aria-label={title} className={({ isActive }) => `side-btn${isActive ? ' active' : ''}`} style={{ width: 40, height: 40 }}>
            <Icon size={20} strokeWidth={1.5} />
          </NavLink>
        </Tooltip>
      ))}
    </nav>
  );
}
