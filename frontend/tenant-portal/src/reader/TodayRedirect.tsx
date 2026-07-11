import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { readerApi } from '../lib/api';
import toast from 'react-hot-toast';

export function TodayRedirect({ slug: propSlug, basePath = '' }: { slug?: string; basePath?: string } = {}) {
  const params = useParams();
  const slug = propSlug || params.slug;
  const navigate = useNavigate();

  useEffect(() => {
    if (!slug) return;
    
    readerApi.getTodayPaper(slug)
      .then(res => {
        if (res.ok && res.data) {
          if (res.data.multiple_available) {
            toast('Multiple papers published today. Showing default.', {
              icon: 'ℹ️',
            });
          }
          const d = new Date(res.data.publish_date);
          const dateSlug = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).replace(/\s+/g, '-').toLowerCase();
          const editionSlug = (res.data.edition_title || 'edition').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
          const prefix = basePath ? basePath + '/' : '/';
          navigate(`${prefix}${dateSlug}/${editionSlug}/${res.data.paper_id}`, { replace: true });
        } else {
          toast.error('No papers published today. Redirecting to library.');
          navigate(basePath || '/', { replace: true });
        }
      })
      .catch(() => {
        toast.error("Error fetching today's paper.");
        navigate(basePath || '/', { replace: true });
      });
  }, [slug, basePath, navigate]);

  return (
    <div className="flex h-[50vh] flex-col items-center justify-center space-y-4">
      <div className="spinner" />
      <span className="text-sm text-muted-foreground">Finding today's paper...</span>
    </div>
  );
}
