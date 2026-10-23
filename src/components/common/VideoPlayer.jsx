import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getVideoPlayback, isPlainVideoClick } from './videoPlayback.js';

const VideoPlayerContext = createContext(null);

function VideoPlayerDialog({ video, onDismiss }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const hintId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <dialog
      ref={dialogRef}
      className="video-player-dialog"
      aria-labelledby={titleId}
      aria-describedby={hintId}
      onCancel={event => { event.preventDefault(); onDismiss(); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right
          || event.clientY < rect.top || event.clientY > rect.bottom) onDismiss();
      }}
    >
      <div className="video-player-shell">
        <header className="video-player-header">
          <h2 id={titleId}>{video.title}</h2>
          <button type="button" className="video-player-close" aria-label="关闭视频播放器" autoFocus onClick={onDismiss}>
            关闭 <span aria-hidden="true">×</span>
          </button>
        </header>
        {video.embedUrl ? (
          <div className="video-player-stage">
            <iframe
              src={video.embedUrl}
              title={`${video.title} · 视频播放器`}
              allow="fullscreen; picture-in-picture; encrypted-media"
              allowFullScreen
              sandbox="allow-scripts allow-same-origin allow-presentation"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        ) : (
          <div className="video-player-unavailable">
            <p>该网站暂不支持页内播放</p>
            <p>请点击下方“在原网站打开”观看视频。</p>
          </div>
        )}
        <footer className="video-player-footer">
          <p id={hintId}>{video.embedUrl ? '点击播放器开始观看。若无法播放或需要登录，可在原网站打开。' : '关闭后可继续使用家庭仪表盘。'}</p>
          <a href={video.url} target="_blank" rel="noopener noreferrer">在原网站打开 ↗</a>
        </footer>
      </div>
    </dialog>,
    document.body,
  );
}

/** One player across result cards, history links, and Markdown replies. Unmounting stops playback. */
export function VideoPlayerProvider({ children }) {
  const [video, setVideo] = useState(null);
  return (
    <VideoPlayerContext.Provider value={setVideo}>
      {children}
      {video && <VideoPlayerDialog video={video} onDismiss={() => setVideo(null)} />}
    </VideoPlayerContext.Provider>
  );
}

/** Real href preserved: Cmd/Ctrl/middle clicks still open the original page normally. */
export function VideoLink({ href, children, videoTitle, onClick, ...props }) {
  const openVideo = useContext(VideoPlayerContext);
  const playback = getVideoPlayback(href);
  return (
    <a
      {...props}
      href={href}
      aria-haspopup={playback && openVideo ? 'dialog' : undefined}
      onClick={event => {
        onClick?.(event);
        if (!openVideo || !playback || !isPlainVideoClick(event)) return;
        event.preventDefault();
        openVideo({ ...playback, title: videoTitle || (typeof children === 'string' ? children : '视频播放') });
      }}
    >
      {children}
    </a>
  );
}
