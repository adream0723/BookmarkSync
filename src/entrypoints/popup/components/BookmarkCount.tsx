import React from 'react';
import { Spinner } from 'react-bootstrap';
import { BsBookmark } from 'react-icons/bs';
import { useBookmarkCount } from '../hooks/useBookmarkCount';

const BookmarkCount: React.FC = () => {
  const { count, loading } = useBookmarkCount();

  return (
    <div className="popup-section d-flex align-items-center">
      <BsBookmark className="popup-icon" />
      <span className="popup-label">书签数量</span>
      <span className="popup-value">
        {loading ? <Spinner animation="border" size="sm" /> : count}
      </span>
    </div>
  );
};

export default BookmarkCount;
