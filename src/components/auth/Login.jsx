import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Login component - WeChat QR login placeholder.
 *
 * This component is intentionally kept as a modular placeholder.
 * To integrate real WeChat OAuth/QR login in the future:
 * 1. Replace the `WeChatQRSection` component with the actual WeChat SDK integration
 * 2. The `onLoginSuccess` callback pattern is already wired to navigate to dashboard
 * 3. The auth service abstraction in `handleLogin` can be swapped for real API calls
 */

function WeChatQRSection({ onScan }) {
  return (
    <div>
      {/* QR Code placeholder - replace with real WeChat QR generation */}
      <div className="wechat-qr-placeholder" onClick={onScan} style={{ cursor: 'pointer' }}>
        <span className="qr-emoji">📱</span>
        <p>微信扫码登录</p>
        <p style={{ fontSize: 11, opacity: 0.7 }}>（点击模拟扫码）</p>
      </div>
      <p style={{ fontSize: 12, color: '#888', textAlign: 'center', marginBottom: 16 }}>
        使用微信扫描上方二维码完成登录
      </p>
      {/* TODO: Replace above with actual WeChat QR SDK component */}
    </div>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const [step, setStep] = useState('idle'); // idle | scanning | success

  /**
   * Auth integration point.
   * Replace this function's body with real WeChat OAuth callback handling.
   */
  function handleLogin() {
    setStep('success');
    setTimeout(() => {
      navigate('/');
    }, 1500);
  }

  function handleQRScan() {
    setStep('scanning');
    // Simulate QR scan delay
    setTimeout(() => {
      setStep('choosing');
    }, 1200);
  }

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Brand */}
        <span className="brand-emoji">🏡</span>
        <h1>家庭仪表盘</h1>
        <p className="subtitle">Family Dashboard · 旅行 · 任务 · 购物 · 促销</p>

        {step === 'idle' && (
          <>
            <WeChatQRSection onScan={handleQRScan} />
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <hr style={{ flex: 1, border: 'none', borderTop: '1px solid #eee' }} />
                <span style={{ fontSize: 12, color: '#bbb' }}>或</span>
                <hr style={{ flex: 1, border: 'none', borderTop: '1px solid #eee' }} />
              </div>
              <button
                className="wechat-btn"
                onClick={handleQRScan}
              >
                <span style={{ fontSize: 20 }}>💚</span>
                微信扫码登录
              </button>
            </div>

            <div style={{ marginTop: 20, padding: '12px 16px', background: '#F0FFF4', borderRadius: 12, textAlign: 'left' }}>
              <div style={{ fontSize: 12, color: '#07C160', fontWeight: 700, marginBottom: 6 }}>
                🔮 登录方式说明
              </div>
              <ul style={{ fontSize: 12, color: '#555', paddingLeft: 16, lineHeight: 2 }}>
                <li>MVP 阶段：点击扫码按钮直接进入</li>
                <li>正式版：将接入微信 OAuth 真实扫码</li>
                <li>登录信息仅用于家庭成员识别</li>
              </ul>
            </div>
          </>
        )}

        {step === 'scanning' && (
          <div style={{ padding: '32px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 64, marginBottom: 16, animation: 'pulse 1s infinite' }}>📱</div>
            <div style={{ fontWeight: 700, color: '#07C160' }}>正在扫码中...</div>
            <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
          </div>
        )}

        {step === 'choosing' && (
          <div>
            <div style={{ fontSize: 14, color: '#555', marginBottom: 16, textAlign: 'center' }}>
              ✅ 扫码成功！请选择你的身份：
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
              {[
                { role: 'parent', emoji: '👨', label: '爸爸', color: '#4A90D9' },
                { role: 'parent', emoji: '👩', label: '妈妈', color: '#E91E8C' },
                { role: 'child',  emoji: '👦', label: '小明', color: '#FF6B35' },
                { role: 'child',  emoji: '👧', label: '小花', color: '#9B59B6' },
              ].map((member, i) => (
                <button
                  key={i}
                  onClick={() => handleLogin()}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '16px 20px',
                    borderRadius: 16,
                    border: `2px solid ${member.color}`,
                    background: member.color + '11',
                    cursor: 'pointer',
                    gap: 6,
                    transition: 'all 0.2s',
                    minWidth: 80,
                  }}
                  onMouseOver={e => { e.currentTarget.style.background = member.color + '33'; }}
                  onMouseOut={e => { e.currentTarget.style.background = member.color + '11'; }}
                >
                  <span style={{ fontSize: 36 }}>{member.emoji}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: member.color }}>{member.label}</span>
                  <span style={{ fontSize: 11, color: '#888' }}>{member.role === 'parent' ? '家长' : '孩子'}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'success' && (
          <div style={{ padding: '32px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--color-success)' }}>
              登录成功！
            </div>
            <div style={{ color: '#888', fontSize: 13, marginTop: 8 }}>正在进入家庭仪表盘...</div>
          </div>
        )}

        {/* Footer note */}
        <div style={{ marginTop: 24, fontSize: 11, color: '#bbb', borderTop: '1px solid #eee', paddingTop: 16 }}>
          <p>此登录模块已预留真实微信 OAuth 接入接口</p>
          <p>Future: Replace WeChatQRSection with real WeChat SDK</p>
        </div>
      </div>
    </div>
  );
}
