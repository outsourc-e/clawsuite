import React, { useState, useRef, useEffect } from 'react';

interface Notification {
  id: string;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  type?: 'info' | 'warning' | 'success' | 'error';
}

interface NotificationBellProps {
  notifications: Notification[];
  onNotificationClick?: (notification: Notification) => void;
  onMarkAllRead?: () => void;
  onClearAll?: () => void;
  maxVisible?: number;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  notifications,
  onNotificationClick,
  onMarkAllRead,
  onClearAll,
  maxVisible = 5,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const visibleNotifications = notifications.slice(0, maxVisible);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatTimestamp = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getTypeColor = (type?: string): string => {
    switch (type) {
      case 'warning': return '#f59e0b';
      case 'success': return '#10b981';
      case 'error': return '#ef4444';
      default: return '#3b82f6';
    }
  };

  return (
    <div ref={dropdownRef} style={styles.container}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={styles.bellButton}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span style={styles.badge}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div style={styles.dropdown}>
          {/* Header */}
          <div style={styles.header}>
            <span style={styles.headerTitle}>Notifications</span>
            {unreadCount > 0 && (
              <button onClick={onMarkAllRead} style={styles.headerAction}>
                Mark all read
              </button>
            )}
          </div>

          {/* Notification List */}
          <div style={styles.notificationList}>
            {visibleNotifications.length === 0 ? (
              <div style={styles.emptyState}>
                <span style={styles.emptyIcon}>🔔</span>
                <span>No notifications</span>
              </div>
            ) : (
              visibleNotifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => onNotificationClick?.(notification)}
                  style={{
                    ...styles.notificationItem,
                    backgroundColor: notification.read ? 'transparent' : '#f0f9ff',
                    cursor: onNotificationClick ? 'pointer' : 'default',
                  }}
                >
                  <div
                    style={{
                      ...styles.typeIndicator,
                      backgroundColor: getTypeColor(notification.type),
                    }}
                  />
                  <div style={styles.notificationContent}>
                    <div style={styles.notificationHeader}>
                      <span style={{
                        ...styles.notificationTitle,
                        fontWeight: notification.read ? 400 : 600,
                      }}>
                        {notification.title}
                      </span>
                      <span style={styles.timestamp}>
                        {formatTimestamp(notification.timestamp)}
                      </span>
                    </div>
                    <p style={styles.notificationMessage}>{notification.message}</p>
                  </div>
                  {!notification.read && <div style={styles.unreadDot} />}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div style={styles.footer}>
              {notifications.length > maxVisible && (
                <span style={styles.moreText}>
                  +{notifications.length - maxVisible} more
                </span>
              )}
              <button onClick={onClearAll} style={styles.clearButton}>
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Bell SVG Icon Component
const BellIcon: React.FC = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

// Styles
const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    display: 'inline-block',
  },
  bellButton: {
    position: 'relative',
    padding: '8px',
    background: 'transparent',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    color: '#374151',
    transition: 'background-color 0.2s',
  },
  badge: {
    position: 'absolute',
    top: '2px',
    right: '2px',
    minWidth: '18px',
    height: '18px',
    padding: '0 5px',
    fontSize: '11px',
    fontWeight: 600,
    color: 'white',
    backgroundColor: '#ef4444',
    borderRadius: '9px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '8px',
    width: '360px',
    maxHeight: '480px',
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)',
    border: '1px solid #e5e7eb',
    overflow: 'hidden',
    zIndex: 1000,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px',
    borderBottom: '1px solid #e5e7eb',
  },
  headerTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#111827',
  },
  headerAction: {
    fontSize: '13px',
    color: '#3b82f6',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
  },
  notificationList: {
    maxHeight: '340px',
    overflowY: 'auto',
  },
  notificationItem: {
    display: 'flex',
    alignItems: 'flex-start',
    padding: '12px 16px',
    borderBottom: '1px solid #f3f4f6',
    transition: 'background-color 0.15s',
  },
  typeIndicator: {
    width: '4px',
    height: '40px',
    borderRadius: '2px',
    marginRight: '12px',
    flexShrink: 0,
  },
  notificationContent: {
    flex: 1,
    minWidth: 0,
  },
  notificationHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '4px',
  },
  notificationTitle: {
    fontSize: '14px',
    color: '#111827',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  timestamp: {
    fontSize: '12px',
    color: '#9ca3af',
    marginLeft: '8px',
    flexShrink: 0,
  },
  notificationMessage: {
    fontSize: '13px',
    color: '#6b7280',
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical' as const,
  },
  unreadDot: {
    width: '8px',
    height: '8px',
    backgroundColor: '#3b82f6',
    borderRadius: '50%',
    marginLeft: '8px',
    marginTop: '6px',
    flexShrink: 0,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    color: '#9ca3af',
    fontSize: '14px',
  },
  emptyIcon: {
    fontSize: '32px',
    marginBottom: '8px',
    opacity: 0.5,
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderTop: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
  },
  moreText: {
    fontSize: '13px',
    color: '#6b7280',
  },
  clearButton: {
    fontSize: '13px',
    color: '#ef4444',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    marginLeft: 'auto',
  },
};

export default NotificationBell;

// Example usage:
/*
import NotificationBell from './notification-bell';

const notifications = [
  {
    id: '1',
    title: 'New message',
    message: 'You have a new message from John Doe',
    timestamp: new Date(Date.now() - 5 * 60000),
    read: false,
    type: 'info' as const,
  },
  {
    id: '2',
    title: 'Task completed',
    message: 'Your export has finished processing',
    timestamp: new Date(Date.now() - 2 * 3600000),
    read: false,
    type: 'success' as const,
  },
  {
    id: '3',
    title: 'Warning',
    message: 'Your storage is almost full',
    timestamp: new Date(Date.now() - 24 * 3600000),
    read: true,
    type: 'warning' as const,
  },
];

<NotificationBell
  notifications={notifications}
  onNotificationClick={(n) => console.log('Clicked:', n)}
  onMarkAllRead={() => console.log('Mark all read')}
  onClearAll={() => console.log('Clear all')}
/>
*/
