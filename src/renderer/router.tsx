import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './Shell';
import { Spinner } from './components/Spinner';
import DetailScreen from './screens/Detail';
import FeedScreen from './screens/Feed';
import HealthScreen from './screens/Health';
import JournalScreen from './screens/Journal';
import LabScreen from './screens/Lab';
import SettingsScreen from './screens/Settings';
import WatchlistScreen from './screens/Watchlist';

const Kit = lazy(() => import('./screens/Kit'));

/** Feed window loads #/feed, Detail window loads #/detail (docs/05 §5.4). Unknown routes go to #/feed. */
export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/feed" element={<FeedScreen />} />
          <Route path="/watchlist" element={<WatchlistScreen />} />
          <Route path="/journal" element={<JournalScreen />} />
          <Route path="/lab" element={<LabScreen />} />
          <Route path="/health" element={<HealthScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          {import.meta.env.DEV ? <Route path="/kit" element={<Suspense fallback={<Spinner />}><Kit /></Suspense>} /> : null}
        </Route>
        <Route path="/detail" element={<DetailScreen />} />
        <Route path="/detail/:tokenId" element={<DetailScreen />} />
        <Route path="*" element={<Navigate to="/feed" replace />} />
      </Routes>
    </HashRouter>
  );
}
