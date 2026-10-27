import { FeedScreen } from '@/components/feed/feed-screen';
import { ANNIVERSARY_TAG } from '@/services/feed-service';

/** The Aniversario's avisos: the Feed's posts tagged #Aniversario. */
export default function AnniversaryNotices() {
  return <FeedScreen tag={ANNIVERSARY_TAG} title="Avisos del aniversario" />;
}
