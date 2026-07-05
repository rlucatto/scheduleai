import React, { useState, useEffect } from 'react';
import { Droplet, Plus, Trash2, Bell, BellOff, Info } from 'lucide-react';

const WaterTracker = () => {
  const [waterIntake, setWaterIntake] = useState(0);
  const [dailyGoal, setDailyGoal] = useState(2000); // 2000ml standard
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [lastDrinkTime, setLastDrinkTime] = useState(Date.now());

  // Load from localStorage on mount
  useEffect(() => {
    const today = new Date().toLocaleDateString();
    const storedDate = localStorage.getItem('water_tracker_date');
    
    if (storedDate === today) {
      const storedIntake = localStorage.getItem('water_tracker_intake');
      if (storedIntake) setWaterIntake(parseInt(storedIntake, 10));
      
      const storedGoal = localStorage.getItem('water_tracker_goal');
      if (storedGoal) setDailyGoal(parseInt(storedGoal, 10));
      
      const storedReminders = localStorage.getItem('water_tracker_reminders');
      if (storedReminders) setRemindersEnabled(storedReminders === 'true');
      
      const storedLastDrink = localStorage.getItem('water_tracker_last_drink');
      if (storedLastDrink) setLastDrinkTime(parseInt(storedLastDrink, 10));
    } else {
      // New day, reset intake
      localStorage.setItem('water_tracker_date', today);
      localStorage.setItem('water_tracker_intake', '0');
      setWaterIntake(0);
    }
  }, []);

  // Save to localStorage when things change
  useEffect(() => {
    localStorage.setItem('water_tracker_intake', waterIntake.toString());
    localStorage.setItem('water_tracker_goal', dailyGoal.toString());
    localStorage.setItem('water_tracker_reminders', remindersEnabled.toString());
    localStorage.setItem('water_tracker_last_drink', lastDrinkTime.toString());
  }, [waterIntake, dailyGoal, remindersEnabled, lastDrinkTime]);

  // Reminder Logic (every 10 minutes checking if 2 hours passed)
  useEffect(() => {
    if (!remindersEnabled) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const twoHours = 2 * 60 * 60 * 1000;
      if (now - lastDrinkTime > twoHours) {
        if (Notification.permission === 'granted') {
          new Notification('Hora de beber água!', {
            body: 'Já faz mais de 2 horas desde seu último copo de água. Que tal se hidratar agora?',
            icon: '/vite.svg'
          });
        }
      }
    }, 10 * 60 * 1000); // Check every 10 mins

    return () => clearInterval(interval);
  }, [remindersEnabled, lastDrinkTime]);

  const addWater = (amount) => {
    setWaterIntake(prev => prev + amount);
    setLastDrinkTime(Date.now());
  };

  const resetWater = () => {
    if (window.confirm('Tem certeza que deseja zerar seu consumo de água de hoje?')) {
      setWaterIntake(0);
    }
  };

  const toggleReminders = async () => {
    if (!remindersEnabled) {
      if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          setRemindersEnabled(true);
        } else {
          alert('Permissão de notificação negada. Não poderemos te lembrar.');
        }
      } else if (Notification.permission === 'granted') {
        setRemindersEnabled(true);
      } else {
        alert('As notificações estão bloqueadas nas configurações do navegador.');
      }
    } else {
      setRemindersEnabled(false);
    }
  };

  const percentage = Math.min(100, Math.round((waterIntake / dailyGoal) * 100));

  return (
    <div className="card glass" style={{ padding: '24px', position: 'relative', overflow: 'hidden' }}>
      
      {/* Background Water Effect */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: `${percentage}%`,
        background: 'linear-gradient(180deg, rgba(56, 189, 248, 0.2) 0%, rgba(2, 132, 199, 0.4) 100%)',
        transition: 'height 1s ease-in-out',
        zIndex: 0,
        pointerEvents: 'none'
      }}></div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Droplet size={24} color="#38bdf8" />
              <h2 style={{ margin: 0, fontSize: '22px' }}>Hidratação Diária</h2>
            </div>
            <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0 0', fontSize: '14px' }}>
              Meta: {dailyGoal}ml
            </p>
          </div>
          
          <button 
            onClick={toggleReminders}
            className={`btn ${remindersEnabled ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {remindersEnabled ? <Bell size={16} /> : <BellOff size={16} />}
            {remindersEnabled ? 'Lembretes Ativos' : 'Lembretes Inativos'}
          </button>
        </div>

        <div style={{ textAlign: 'center', margin: '40px 0' }}>
          <div style={{ fontSize: '48px', fontWeight: '800', color: 'var(--text-primary)' }}>
            {waterIntake} <span style={{ fontSize: '20px', color: 'var(--text-secondary)', fontWeight: 'normal' }}>ml</span>
          </div>
          <div style={{ 
            marginTop: '8px', 
            fontSize: '16px', 
            color: percentage >= 100 ? '#10b981' : 'var(--accent-hover)',
            fontWeight: '600'
          }}>
            {percentage}% da meta alcançada
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '24px' }}>
          <button className="btn btn-secondary" onClick={() => addWater(150)} style={{ display: 'flex', gap: '6px' }}>
            <Plus size={16} /> 150ml
          </button>
          <button className="btn btn-primary" onClick={() => addWater(250)} style={{ display: 'flex', gap: '6px' }}>
            <Plus size={16} /> 250ml
          </button>
          <button className="btn btn-secondary" onClick={() => addWater(500)} style={{ display: 'flex', gap: '6px' }}>
            <Plus size={16} /> 500ml
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '13px' }}>
            <Info size={14} />
            Última vez: {new Date(lastDrinkTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          
          <button onClick={resetWater} style={{ 
            background: 'transparent', border: 'none', color: 'var(--text-secondary)', 
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' 
          }}>
            <Trash2 size={14} />
            Zerar Hoje
          </button>
        </div>
      </div>
    </div>
  );
};

export default WaterTracker;
