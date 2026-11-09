import { Link } from 'react-router';
import { EmptyState } from '../components/Feedback';

export default function NotFound() {
  return (
    <div className="main" style={{ paddingTop: 48 }}>
      <EmptyState
        icon="alert"
        title="Page not found"
        action={
          <Link to="/" className="btn btn--primary btn--sm">
            Back to overview
          </Link>
        }
      >
        The page you’re looking for doesn’t exist.
      </EmptyState>
    </div>
  );
}
