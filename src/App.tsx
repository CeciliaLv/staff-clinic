import React, { useState, useEffect } from 'react';
import { AppProvider, useAppStore } from './store';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { Dashboard } from './views/Dashboard';
import { Drugs } from './views/Drugs';
import { Inbound } from './views/Inbound';
import { Outbound } from './views/Outbound';
import { Stock } from './views/Stock';
import { Batches } from './views/Batches';
import { Query } from './views/Query';
import { Params } from './views/Params';
import { GlobalUI } from './components/GlobalUI';
import { Stethoscope } from 'lucide-react';

function MainApp({ user, onLogout }: { user: string, onLogout: () => void }) {
  const { currentMod, navigate, loading } = useAppStore();

  if (loading) return <div className="p-8 text-center text-gray-500">正在加载真实数据库数据...</div>;

  return (
    <div className="flex min-h-screen">
      <Sidebar currentMod={currentMod} onNavigate={navigate} />
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden">
        <Topbar currentMod={currentMod} user={user} onLogout={onLogout} />
        <div className="flex-1 min-h-0 overflow-y-auto p-[22px] flex flex-col">
          {currentMod === 'dash' && <Dashboard onNavigate={navigate} />}
          {currentMod === 'drugs' && <Drugs />}
          {currentMod === 'in' && <Inbound />}
          {currentMod === 'out' && <Outbound />}
          {currentMod === 'stock' && <Stock />}
          {currentMod === 'batch' && <Batches />}
          {currentMod === 'query' && <Query />}
          {currentMod === 'param' && <Params />}
        </div>
      </div>
    </div>
  );
}

function AuthApp() {
  const { token, setToken, showConfirm } = useAppStore();
  const [user, setUser] = useState<string | null>(null);
  const [loginUser, setLoginUser] = useState('');
  const [loginPwd, setLoginPwd] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [regUser, setRegUser] = useState('');
  const [regPwd, setRegPwd] = useState('');
  const [regPwd2, setRegPwd2] = useState('');
  const [regErr, setRegErr] = useState('');
  const [regSuccess, setRegSuccess] = useState('');

  useEffect(() => {
    if (token) {
      // Decode JWT to get user, or just trust token
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser(payload.username);
      } catch (e) {
        setUser('admin');
      }
    } else {
      setUser(null);
    }
  }, [token]);

  const doLogin = async () => {
    const u = loginUser.trim();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: loginPwd })
      });
      if (res.ok) {
        const json = await res.json();
        setToken(json.token);
        setUser(json.username);
        setLoginErr('');
      } else {
        const json = await res.json();
        setLoginErr(json.error || '账号或密码错误');
      }
    } catch (e) {
      setLoginErr('网络请求失败，请确保后端服务正常运行');
    }
  };

  const doRegister = async () => {
    const u = regUser.trim();
    setRegErr('');
    setRegSuccess('');

    if (!u) return setRegErr('请输入账号');
    if (u.length < 3) return setRegErr('账号至少3个字符');
    if (!/^[a-zA-Z0-9_]+$/.test(u)) return setRegErr('账号只能包含字母、数字和下划线');
    if (!regPwd) return setRegErr('请输入密码');
    if (regPwd.length < 6) return setRegErr('密码至少6位');
    if (regPwd !== regPwd2) return setRegErr('两次输入的密码不一致');

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: regPwd })
      });
      if (res.ok) {
        setRegSuccess('注册成功！请使用新账号登录');
        setRegUser('');
        setRegPwd('');
        setRegPwd2('');
        // 自动填充到登录表单
        setLoginUser(u);
        setLoginPwd('');
        // 2秒后切换回登录
        setTimeout(() => {
          setShowRegister(false);
          setRegSuccess('');
        }, 2000);
      } else {
        const json = await res.json();
        setRegErr(json.error || '注册失败，请稍后重试');
      }
    } catch (e) {
      setRegErr('网络请求失败，请确保后端服务正常运行');
    }
  };

  const handleLogout = async () => {
    if (await showConfirm('确认退出登录？')) {
      setToken(null);
    }
  };

  if (user) {
    return <MainApp user={user} onLogout={handleLogout} />;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gradient-to-br from-[#e8f1f8] to-[#dce9f4]">
      <div className="w-[340px] bg-white border border-[#d4e0ec] rounded-[18px] py-[34px] px-[30px] shadow-[0_20px_60px_rgba(24,144,255,0.18)] text-center">
        <div className="w-[56px] h-[56px] rounded-[14px] mx-auto mb-[14px] grid place-items-center text-[28px] bg-gradient-to-br from-[#1890ff] to-[#40a9ff] shadow-[0_8px_22px_rgba(24,144,255,0.4)] text-white">
          <Stethoscope size={32} />
        </div>
        <h2 className="m-0 text-[20px] text-[#1a2b42] font-bold">集团医务室</h2>
        <p className="mt-[6px] mb-[22px] text-[#8da3be] text-[13px]">药品进销存管理系统</p>
        
        {!showRegister ? (
          <>
            <div className="text-left mb-[14px]">
              <label className="block text-[12px] text-[#5a6b82] mb-[6px]">账号</label>
              <input 
                 className="w-full bg-[#f7fafc] border border-[#d4e0ec] text-[#1a2b42] py-[11px] px-[13px] rounded-[10px] text-[14px] outline-none box-border focus:border-[#1890ff] focus:shadow-[0_0_0_3px_rgba(24,144,255,0.12)]"
                 placeholder="请输入账号"
                 value={loginUser}
                onChange={e => setLoginUser(e.target.value)}
              />
            </div>
            <div className="text-left mb-[14px]">
              <label className="block text-[12px] text-[#5a6b82] mb-[6px]">密码</label>
              <input 
                 type="password"
                className="w-full bg-[#f7fafc] border border-[#d4e0ec] text-[#1a2b42] py-[11px] px-[13px] rounded-[10px] text-[14px] outline-none box-border focus:border-[#1890ff] focus:shadow-[0_0_0_3px_rgba(24,144,255,0.12)]"
                 placeholder="请输入密码"
                 value={loginPwd}
                onChange={e => setLoginPwd(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doLogin()}
              />
            </div>
            <div className="text-[#e34d4d] text-[12px] min-h-[16px] mb-[8px] text-left">{loginErr}</div>
            <button 
               className="w-full border-none bg-gradient-to-br from-[#1890ff] to-[#40a9ff] text-white text-[15px] font-semibold py-[12px] rounded-[10px] cursor-pointer tracking-[2px] hover:brightness-105"
              onClick={doLogin}
            >
              登 录
            </button>
            <div className="mt-[16px] text-[12px] text-[#8da3be]">
              还没有账号？
              <button 
                className="text-[#1890ff] bg-transparent border-none cursor-pointer font-semibold hover:underline ml-[4px] p-0"
                onClick={() => { setShowRegister(true); setRegErr(''); setRegSuccess(''); }}
              >
                注册新账号
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-left mb-[14px]">
              <label className="block text-[12px] text-[#5a6b82] mb-[6px]">账号</label>
              <input 
                 className="w-full bg-[#f7fafc] border border-[#d4e0ec] text-[#1a2b42] py-[11px] px-[13px] rounded-[10px] text-[14px] outline-none box-border focus:border-[#1890ff] focus:shadow-[0_0_0_3px_rgba(24,144,255,0.12)]"
                 placeholder="3-30位字母、数字或下划线"
                 value={regUser}
                onChange={e => setRegUser(e.target.value)}
              />
            </div>
            <div className="text-left mb-[14px]">
              <label className="block text-[12px] text-[#5a6b82] mb-[6px]">密码</label>
              <input 
                 type="password"
                className="w-full bg-[#f7fafc] border border-[#d4e0ec] text-[#1a2b42] py-[11px] px-[13px] rounded-[10px] text-[14px] outline-none box-border focus:border-[#1890ff] focus:shadow-[0_0_0_3px_rgba(24,144,255,0.12)]"
                 placeholder="至少6位"
                 value={regPwd}
                onChange={e => setRegPwd(e.target.value)}
              />
            </div>
            <div className="text-left mb-[14px]">
              <label className="block text-[12px] text-[#5a6b82] mb-[6px]">确认密码</label>
              <input 
                 type="password"
                className="w-full bg-[#f7fafc] border border-[#d4e0ec] text-[#1a2b42] py-[11px] px-[13px] rounded-[10px] text-[14px] outline-none box-border focus:border-[#1890ff] focus:shadow-[0_0_0_3px_rgba(24,144,255,0.12)]"
                 placeholder="再次输入密码"
                 value={regPwd2}
                onChange={e => setRegPwd2(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doRegister()}
              />
            </div>
            <div className={`text-[12px] min-h-[16px] mb-[8px] text-left ${regErr ? 'text-[#e34d4d]' : regSuccess ? 'text-[#389e0d]' : ''}`}>
              {regErr || regSuccess}
            </div>
            <button 
               className="w-full border-none bg-gradient-to-br from-[#1890ff] to-[#40a9ff] text-white text-[15px] font-semibold py-[12px] rounded-[10px] cursor-pointer tracking-[2px] hover:brightness-105"
              onClick={doRegister}
            >
              注 册
            </button>
            <div className="mt-[16px] text-[12px] text-[#8da3be]">
              已有账号？
              <button 
                className="text-[#1890ff] bg-transparent border-none cursor-pointer font-semibold hover:underline ml-[4px] p-0"
                onClick={() => { setShowRegister(false); setRegErr(''); setRegSuccess(''); }}
              >
                返回登录
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AuthApp />
      <GlobalUI />
    </AppProvider>
  );
}
