import { FilterRail } from './FilterRail';
import { FeedTable } from './FeedTable';

export default function FeedScreen() {
  return (
    <div style={{ display: 'flex', height: '100%', minWidth: 0 }}>
      <FilterRail />
      <FeedTable />
    </div>
  );
}
