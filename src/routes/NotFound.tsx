import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/Feedback';
import { Page } from '@/components/Layout';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <Page className="pt-16">
      <EmptyState
        icon={Compass}
        title="Page Not Found"
        action={
          <Button asChild>
            <Link to="/">Back to Overview</Link>
          </Button>
        }
      >
        The page you’re looking for doesn’t exist.
      </EmptyState>
    </Page>
  );
}
