import { FeedScreen } from '@/components/feed/feed-screen';
import { ANNIVERSARY_TAG } from '@/services/feed-service';
import { t } from '@/i18n';

/** The Aniversario's avisos: the Feed's posts tagged #Aniversario. */
export default function AnniversaryNotices() {
  return <FeedScreen tag={ANNIVERSARY_TAG} title={t('anniversary.notices.avisosDelAniversario')} />;
}
