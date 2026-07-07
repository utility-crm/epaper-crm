import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { readerApi } from '../lib/api';
import toast from 'react-hot-toast';

export function TodayRedirect() {
  const { slug } = useParams();
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
          navigate(`/read/${slug}/paper/${res.data.paper_id}`, { replace: true });
        } else {
          toast.error('No papers published today. Redirecting to library.');
          navigate(`/read/${slug}`, { replace: true });
        }
      })
      .catch(() => {
        toast.error("Error fetching today's paper.");
        navigate(`/read/${slug}`, { replace: true });
      });
  }, [slug, navigate]);

  return (
    <div className="flex h-[50vh] flex-col items-center justify-center space-y-4">
      <div className="spinner" />
      <span className="text-sm text-muted-foreground">Finding today's paper...</span>
    </div>
  );
}
