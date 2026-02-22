"use client";
import { useEffect, useState, useRef } from "react";
import { createClient } from '@supabase/supabase-js';

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

export default function Home() {
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

  // --- [修正：补全了 handleDragStart] ---
  const handleDragStart = (idx: number) => {
    setDraggedIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDrop = async (targetIdx: number) => {
    if (draggedIdx === null) return;
    const newTasks = [...tasks];
    const [draggedItem] = newTasks.splice(draggedIdx, 1);
    newTasks.splice(targetIdx, 0, draggedItem);
    setTasks(newTasks);
    setDraggedIdx(null);
    const updates = newTasks.map((t, index) => ({
      id: t.id, 
      sort_order: index, 
      scheduled_date: selectedDate, 
      content: t.content,
      color_hex: t.color_hex,
      status: t.status,
      task_type: t.task_type
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
        if (running) {
          await supabase.from("tasks").update({ duration_actual: (running.duration_actual || 0) + (currentSessionSec / 60) }).eq('id', running.id);
        }
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
    const newOrder = tasks.length;
    await supabase.from("tasks").insert([{
      content, task_type: 'timed', duration_planned: 0, duration_actual: 0,
      status: 'planning', color_hex: selectedColor, scheduled_date: selectedDate,
      sort_order: newOrder
    }]);
    setContent(""); 
    fetchDailyData();
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

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10 font-sans text-slate-900">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* 左侧：想法池 */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
            <h2 className="text-xl font-black mb-4">想法池 💡</h2>
            <input value={content} onChange={e => setContent(e.target.value)} className="w-full px-4 py-3 rounded-2xl bg-slate-50 outline-none mb-3" placeholder="新想法..." />
            <div className="flex justify-between items-center">
              <div className="flex gap-1.5">
                {COLORS.map(c => (
                  <button key={c} onClick={() => setSelectedColor(c)} className={`w-5 h-5 rounded-full ${selectedColor === c ? 'ring-2 ring-offset-2 ring-slate-400' : ''}`} style={{ backgroundColor: c }} />
                ))}
              </div>
              <button onClick={collectTask} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold">创建</button>
            </div>
          </div>

          <div className="space-y-3">
            {tasks.map((t, idx) => {
              const isAllocated = t.status !== 'planning';
              return (
                <div
                  key={t.id} draggable onDragStart={() => handleDragStart(idx)} onDragOver={handleDragOver} onDrop={() => handleDrop(idx)}
                  className={`bg-white p-4 rounded-2xl border-l-4 flex flex-col gap-3 shadow-sm transition-all cursor-move
                    ${isAllocated ? 'grayscale opacity-60 bg-slate-50' : 'hover:scale-[1.02]'} 
                    ${draggedIdx === idx ? 'opacity-20' : ''}`}
                  style={{ borderLeftColor: isAllocated ? '#cbd5e1' : t.color_hex }}
                >
                  <div className="flex justify-between items-start">
                    <input value={t.content} onChange={(e) => updateTaskField(t.id, 'content', e.target.value)} disabled={isAllocated} className="font-bold bg-transparent outline-none w-full cursor-text disabled:cursor-not-allowed" />
                    <button onClick={() => deleteTask(t.id)} className="text-slate-300 hover:text-red-500 ml-2">✕</button>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex gap-1">
                      {COLORS.map(c => (
                        <button key={c} onClick={() => !isAllocated && updateTaskField(t.id, 'color_hex', c)} className={`w-4 h-4 rounded-full ${t.color_hex === c ? 'ring-1 ring-offset-1 ring-slate-400' : ''}`} style={{ backgroundColor: c, cursor: isAllocated ? 'not-allowed' : 'pointer' }} />
                      ))}
                    </div>
                    {!isAllocated ? (
                      <button onClick={() => allocateTask(t.id)} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase">分配</button>
                    ) : (
                      <span className="text-[9px] font-bold text-slate-400 uppercase italic">In Schedule</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 右侧：执行时间池 */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100">
            <header className="flex justify-between items-end mb-10">
              <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="text-xl font-black bg-indigo-50 px-4 py-2 rounded-2xl text-indigo-600 outline-none" />
              <div className="text-right cursor-pointer group" onClick={adjustTotalBudget}>
                <div className="text-3xl font-black text-indigo-600 group-hover:scale-105 transition-transform">
                  {formatMins(totalBudget - allocatedMins)} <span className="text-sm font-normal text-slate-300 uppercase italic">Free</span>
                </div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">点击调整总额: {formatMins(totalBudget)}</div>
              </div>
            </header>

            <div className="space-y-4">
              {activeTasks.map(t => {
                const isThisActive = activeTaskId === t.id;
                const isDone = t.status === 'done';
                const elapsedMins = (t.duration_actual || 0) + (isThisActive ? currentSessionSec / 60 : 0);
                const remainMins = t.duration_planned - elapsedMins;

                return (
                  <div key={t.id} className={`relative p-6 rounded-[2rem] border transition-all ${isThisActive ? 'ring-2 ring-indigo-500 bg-indigo-50 shadow-lg' : 'bg-white border-slate-100'}`}>
                    <div className="relative z-10 flex justify-between items-center">
                      <div className="flex-1">
                        <div className={`font-black text-lg ${isDone ? 'text-slate-300 line-through' : 'text-slate-800'}`}>{t.content}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color_hex }} />
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Budget {formatMins(t.duration_planned)} / Used {formatMins(elapsedMins)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {!isDone && (
                          <div className={`font-mono font-black text-2xl ${remainMins < 5 ? 'text-red-500 animate-pulse' : 'text-slate-700'}`}>
                            {Math.floor(Math.max(0, remainMins))}:{String(Math.floor(Math.max(0, Math.abs(remainMins * 60) % 60))).padStart(2, '0')}
                          </div>
                        )}
                        <div className="flex gap-2 items-center">
                          {!isDone && (
                            <>
                              <div className="flex bg-slate-100 p-1 rounded-full items-center">
                                <button onClick={() => updateTaskField(t.id, 'task_type', t.task_type === 'timed' ? 'fixed' : 'timed')} className={`px-3 py-1 text-[9px] font-black rounded-full transition-all ${t.task_type === 'fixed' ? 'bg-white shadow-sm' : 'text-slate-400'}`}>FIX</button>
                                {t.task_type === 'timed' && (
                                  <button onClick={() => handleToggle(t)} className={`w-8 h-8 flex items-center justify-center rounded-full text-white ml-1 ${isThisActive ? 'bg-amber-400' : 'bg-indigo-600'}`}>
                                    {isThisActive ? '⏸' : '▶'}
                                  </button>
                                )}
                              </div>
                              <button onClick={() => handleFinish(t)} className="bg-slate-900 text-white px-5 py-2 rounded-xl text-xs font-black">DONE</button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    {!isDone && (
                      <div className="absolute left-0 top-0 bottom-0 opacity-[0.06] rounded-r-2xl" style={{ width: `${Math.min(100, (t.duration_planned / totalBudget) * 100)}%`, backgroundColor: t.color_hex }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}