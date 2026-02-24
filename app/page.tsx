"use client";
import { useEffect, useState, useRef } from "react";
import { createClient } from '@supabase/supabase-js';

// ==========================================
// 1. 基础配置与工具函数
// ==========================================
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#8b5cf6'];

const formatMins = (mins: number) => {
  const absMins = Math.max(0, Math.round(mins));
  const h = Math.floor(absMins / 60);
  const m = absMins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

// ==========================================
// 2. 主组件开始
// ==========================================
export default function Home() {
  // --- 状态定义 ---
  const [tasks, setTasks] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [totalBudget, setTotalBudget] = useState(480);
  const [mounted, setMounted] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
  const [currentSessionSec, setCurrentSessionSec] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [content, setContent] = useState("");
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);

  // --- 生命周期与数据获取 ---
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (mounted) fetchDailyData(); }, [selectedDate, mounted]);

  useEffect(() => {
    if (activeTaskId) {
      timerRef.current = setInterval(() => setCurrentSessionSec(s => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeTaskId]);

  async function fetchDailyData() {
    const { data: bData } = await supabase.from("daily_budgets").select("*").eq("date", selectedDate).single();
    setTotalBudget(bData ? bData.total_minutes : 480);
    const { data: tData } = await supabase.from("tasks").select("*").eq("scheduled_date", selectedDate).order("sort_order", { ascending: true });
    setTasks(tData || []);
  }

  // --- 业务逻辑函数 ---
  async function adjustTotalBudget() {
    const h = Math.floor(totalBudget / 60);
    const m = totalBudget % 60;
    const newH = prompt("设定今日总小时 (H):", h.toString());
    const newM = prompt("设定今日总分钟 (M):", m.toString());
    if (newH !== null && newM !== null) {
      const total = (parseInt(newH) * 60) + (parseInt(newM) || 0);
      if (!isNaN(total)) {
        setTotalBudget(total);
        await supabase.from("daily_budgets").upsert({ date: selectedDate, total_minutes: total }, { onConflict: 'date' });
      }
    }
  }

  const handleDragStart = (idx: number) => setDraggedIdx(idx);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  
  const handleDrop = async (targetIdx: number) => {
    if (draggedIdx === null) return;
    const newTasks = [...tasks];
    const [draggedItem] = newTasks.splice(draggedIdx, 1);
    newTasks.splice(targetIdx, 0, draggedItem);
    setTasks(newTasks);
    setDraggedIdx(null);
    const updates = newTasks.map((t, index) => ({
      id: t.id, sort_order: index, scheduled_date: selectedDate, content: t.content, color_hex: t.color_hex, status: t.status, task_type: t.task_type
    }));
    await supabase.from("tasks").upsert(updates);
  };

  async function updateTaskField(id: number, field: string, value: any) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
    await supabase.from("tasks").update({ [field]: value }).eq('id', id);
  }

  async function deleteTask(id: number) {
    if (confirm("确定要删除吗？")) {
      setTasks(prev => prev.filter(t => t.id !== id));
      await supabase.from("tasks").delete().eq('id', id);
    }
  }

  async function handleToggle(task: any) {
    if (activeTaskId === task.id) {
      const newActual = (task.duration_actual || 0) + (currentSessionSec / 60);
      setActiveTaskId(null);
      setCurrentSessionSec(0);
      await supabase.from("tasks").update({ duration_actual: newActual }).eq('id', task.id);
      fetchDailyData();
    } else {
      if (activeTaskId) {
        const running = tasks.find(t => t.id === activeTaskId);
        if (running) await supabase.from("tasks").update({ duration_actual: (running.duration_actual || 0) + (currentSessionSec / 60) }).eq('id', running.id);
      }
      setActiveTaskId(task.id);
      setCurrentSessionSec(0);
    }
  }

  async function handleFinish(task: any) {
    let finalActual = task.duration_actual || 0;
    if (activeTaskId === task.id) finalActual += (currentSessionSec / 60);
    if (task.task_type === 'fixed') finalActual = task.duration_planned;
    setActiveTaskId(null);
    setCurrentSessionSec(0);
    await supabase.from("tasks").update({ status: 'done', duration_actual: finalActual }).eq('id', task.id);
    fetchDailyData();
  }

  async function collectTask() {
    if (!content.trim()) return;
    await supabase.from("tasks").insert([{
      content, task_type: 'timed', duration_planned: 0, duration_actual: 0,
      status: 'planning', color_hex: selectedColor, scheduled_date: selectedDate,
      sort_order: tasks.length
    }]);
    setContent(""); fetchDailyData();
  }

  async function allocateTask(id: number) {
    const t = prompt("分配多少分钟?", "60");
    if (t) {
      await supabase.from("tasks").update({ duration_planned: Number(t), status: 'todo' }).eq('id', id);
      fetchDailyData();
    }
  }

  if (!mounted) return null;
  const allocatedMins = tasks.reduce((sum, t) => sum + (t.duration_planned || 0), 0);
  const activeTasks = tasks.filter(t => t.status !== 'planning');

  // ==========================================
  // 3. UI 渲染 (关键的 return 块)
  // ==========================================
  return (
    <div className="min-h-screen bg-[#F5F5F7] p-6 md:p-10 font-sans text-[#1D1D1F] selection:bg-indigo-100">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* 左侧：想法池 */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white/80 backdrop-blur-xl p-6 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/50">
            <h2 className="text-xl font-semibold mb-5 flex items-center gap-2">
              <span className="text-2xl">💡</span> 灵感储备
            </h2>
            <input 
              value={content} 
              onChange={e => setContent(e.target.value)} 
              className="w-full px-5 py-4 rounded-2xl bg-gray-100/50 border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none mb-4 transition-all" 
              placeholder="记录一个新想法..." 
            />
            <div className="flex justify-between items-center">
              <div className="flex gap-2">
                {COLORS.map(c => (
                  <button 
                    key={c} 
                    onClick={() => setSelectedColor(c)} 
                    className={`w-6 h-6 rounded-full transition-transform active:scale-90 ${selectedColor === c ? 'ring-2 ring-offset-2 ring-indigo-400' : 'hover:scale-110'}`} 
                    style={{backgroundColor: c}} 
                  />
                ))}
              </div>
              <button 
                onClick={collectTask} 
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-full text-sm font-medium transition-all shadow-md shadow-indigo-200 active:scale-95"
              >
                入池
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {tasks.map((t, idx) => {
              const isAllocated = t.status !== 'planning';
              return (
                <div 
                  key={t.id} draggable onDragStart={() => handleDragStart(idx)} onDragOver={handleDragOver} onDrop={() => handleDrop(idx)}
                  className={`group bg-white p-5 rounded-[2rem] border-l-[6px] shadow-sm transition-all cursor-grab active:cursor-grabbing
                    ${isAllocated ? 'grayscale opacity-50 bg-gray-50' : 'hover:shadow-md hover:-translate-y-1'} 
                    ${draggedIdx === idx ? 'opacity-30' : ''}`}
                  style={{borderLeftColor: isAllocated ? '#D1D1D6' : t.color_hex}}
                >
                  <div className="flex justify-between items-start mb-3">
                    <input 
                      value={t.content} 
                      onChange={(e) => updateTaskField(t.id, 'content', e.target.value)} 
                      disabled={isAllocated} 
                      className="font-semibold bg-transparent outline-none w-full text-gray-700 disabled:cursor-not-allowed" 
                    />
                    <button onClick={() => deleteTask(t.id)} className="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex gap-1.5">
                      {COLORS.map(c => (
                        <button 
                          key={c} 
                          onClick={() => !isAllocated && updateTaskField(t.id, 'color_hex', c)} 
                          className={`w-4 h-4 rounded-full transition-transform ${t.color_hex === c ? 'ring-1 ring-offset-1 ring-gray-400' : 'hover:scale-125'}`} 
                          style={{backgroundColor: c, cursor: isAllocated ? 'not-allowed' : 'pointer'}} 
                        />
                      ))}
                    </div>
                    {!isAllocated && (
                      <button onClick={() => allocateTask(t.id)} className="text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-4 py-1.5 rounded-full text-[11px] font-bold transition-colors">
                        分配时间
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 右侧：执行区 */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white/40 backdrop-blur-md p-8 rounded-[3rem] border border-white shadow-[0_20px_50px_rgba(0,0,0,0.02)]">
            <header className="flex justify-between items-center mb-12">
              <input 
                type="date" 
                value={selectedDate} 
                onChange={e => setSelectedDate(e.target.value)} 
                className="text-lg font-medium bg-white/80 px-5 py-2.5 rounded-2xl shadow-sm border-none outline-none text-gray-600 focus:ring-2 focus:ring-indigo-500/10" 
              />
              <div className="text-right cursor-pointer group" onClick={adjustTotalBudget}>
                <div className="text-4xl font-light tracking-tight text-indigo-600 group-hover:scale-105 transition-transform duration-500">
                  {formatMins(totalBudget - allocatedMins)} <span className="text-sm font-normal text-gray-400">可用</span>
                </div>
                <div className="text-[11px] font-medium text-gray-400 mt-1">总额: {formatMins(totalBudget)}</div>
              </div>
            </header>

            <div className="space-y-5">
              {activeTasks.map(t => {
                const isThisActive = activeTaskId === t.id;
                const isDone = t.status === 'done';
                const elapsedMins = (t.duration_actual || 0) + (isThisActive ? currentSessionSec / 60 : 0);
                const remainMins = t.duration_planned - elapsedMins;

                return (
                  <div key={t.id} className={`group relative overflow-hidden p-7 rounded-[2.5rem] transition-all duration-500 ${isThisActive ? 'bg-white shadow-xl scale-[1.02]' : 'bg-white/60 hover:bg-white'}`}>
                    <div className="relative z-10 flex justify-between items-center">
                      <div className="flex-1">
                        <h3 className={`text-xl font-semibold transition-all ${isDone ? 'text-gray-300 line-through' : 'text-gray-800'}`}>
                          {t.content}
                        </h3>
                        <div className="flex items-center gap-3 mt-3">
                          <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{backgroundColor: t.color_hex}} />
                          <div className="h-1 w-24 bg-gray-100 rounded-full overflow-hidden">
                             <div className="h-full transition-all duration-1000" style={{backgroundColor: t.color_hex, width: `${Math.min(100, (elapsedMins/t.duration_planned)*100)}%`}} />
                          </div>
                          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                            {formatMins(elapsedMins)} / {formatMins(t.duration_planned)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        {!isDone && (
                          <div className={`font-mono text-3xl font-light tracking-tighter ${remainMins < 5 ? 'text-red-500 animate-pulse' : 'text-indigo-500'}`}>
                            {Math.floor(Math.max(0, remainMins))}:{String(Math.floor(Math.max(0, Math.abs(remainMins * 60) % 60))).padStart(2, '0')}
                          </div>
                        )}
                        <div className="flex items-center gap-3">
                          {!isDone && (
                            <>
                              <div className="flex bg-gray-100 p-1.5 rounded-full items-center">
                                <button 
                                  onClick={() => updateTaskField(t.id, 'task_type', t.task_type === 'timed' ? 'fixed' : 'timed')} 
                                  className={`px-4 py-1.5 text-[10px] font-bold rounded-full transition-all ${t.task_type === 'fixed' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'}`}
                                >
                                  固定
                                </button>
                                {t.task_type === 'timed' && (
                                  <button onClick={() => handleToggle(t)} className={`w-10 h-10 flex items-center justify-center rounded-full text-white ml-2 transition-all ${isThisActive ? 'bg-amber-400 rotate-180' : 'bg-indigo-600 hover:shadow-lg hover:shadow-indigo-200'}`}>
                                    {isThisActive ? '⏸' : '▶'}
                                  </button>
                                )}
                              </div>
                              <button onClick={() => handleFinish(t)} className="bg-gray-900 hover:bg-black text-white px-6 py-2.5 rounded-2xl text-xs font-bold transition-all active:scale-95">
                                完成
                              </button>
                            </>
                          )}
                          {isDone && (
                            <div className="flex items-center gap-2 text-green-500 bg-green-50 px-4 py-2 rounded-full">
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>
                              <span className="text-xs font-bold uppercase tracking-widest">已达成</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} // <--- 主组件 Home 结束的大括号，确保它在最后