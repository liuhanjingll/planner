"use client";
// ... (保持顶部的 import 和变量定义不变，直接从 return 部分开始优化样式)

  return (
    <div className="min-h-screen bg-[#F5F5F7] p-6 md:p-10 font-sans text-[#1D1D1F] selection:bg-indigo-100">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* 左侧：想法池 - 更加精致的侧边栏 */}
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
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="6 18L18 6M6 6l12 12" /></svg>
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

        {/* 右侧：执行区 - 极简主义设计 */}
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