import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, ArrowRight, Calendar, Settings, List, LogOut, User, Key, Save, Trash2, Download, Printer, X, CheckCircle, AlertCircle, Plus, Minus, TestTube2, Info, Loader2, Clock, Copy, ArrowUpDown } from 'lucide-react';

// --- Configuration ---
// !!! 重要：請將此處的網址換成您部署 Google Apps Script 後取得的網址 !!!
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbzp1DS5XSnomjH1Ao6Ss3E7pk5bAAq6Kvg48hVwt4Shpg1GsZfDShm7dxLxVxSIcvLO/exec";

// --- Helper Functions ---
const parseCsvToUsers = (csvText) => {
    if (!csvText) return [];
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const accountIndex = headers.indexOf('account');
    const passwordIndex = headers.indexOf('password');
    const roleIndex = headers.indexOf('role');
    const nameIndex = headers.indexOf('name');

    return lines.slice(1).map(line => {
        const columns = line.split(',').map(col => col.trim().replace(/^"|"$/g, ''));
        return {
            account: columns[accountIndex],
            password: columns[passwordIndex],
            role: columns[roleIndex] === '管理員' ? 'Admin' : 'Teacher',
            name: columns[nameIndex]
        };
    });
};

const initialWeeklyAvailability = () => [
    { dayName: '週日', dayOfWeek: 0, isEnabled: false, slots: [] },
    { dayName: '週一', dayOfWeek: 1, isEnabled: true, slots: [] },
    { dayName: '週二', dayOfWeek: 2, isEnabled: true, slots: [] },
    { dayName: '週三', dayOfWeek: 3, isEnabled: true, slots: [] },
    { dayName: '週四', dayOfWeek: 4, isEnabled: true, slots: [] },
    { dayName: '週五', dayOfWeek: 5, isEnabled: true, slots: [] },
    { dayName: '週六', dayOfWeek: 6, isEnabled: false, slots: [] },
];

const generatePeriodsFromAvailability = (availability, duration) => {
    if (!availability || !duration) return [];
    
    const allSlots = new Set();

    availability.forEach(day => {
        if (day.isEnabled) {
            (day.slots || []).forEach(timeRange => {
                if(!timeRange.start || !timeRange.end) return;
                let currentTime = new Date(`1970-01-01T${timeRange.start}`);
                const endTime = new Date(`1970-01-01T${timeRange.end}`);

                while(currentTime < endTime) {
                    const slotStart = new Date(currentTime);
                    const slotEnd = new Date(slotStart.getTime() + duration * 60000);
                    
                    if (slotEnd > endTime) break;

                    allSlots.add(slotStart.toTimeString().substring(0, 5));
                    currentTime = slotEnd;
                }
            });
        }
    });

    const sortedSlots = Array.from(allSlots).sort();

    return sortedSlots.map((startTime, index) => {
        const slotStart = new Date(`1970-01-01T${startTime}`);
        const slotEnd = new Date(slotStart.getTime() + duration * 60000);
        return {
            period: index + 1,
            start: startTime,
            end: slotEnd.toTimeString().substring(0, 5),
        };
    });
};

const formatISODateToYYYYMMDD = (isoString) => {
    // If the string doesn't contain 'T', it's likely already in YYYY-MM-DD format or something we shouldn't touch.
    if (!isoString || !isoString.includes('T')) {
        return isoString;
    }
    try {
        // new Date() parses the UTC ISO string and converts it to the browser's local time zone.
        const date = new Date(isoString);
        
        // Extract year, month, and day from the local date object.
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        
        return `${year}-${month}-${day}`;
    } catch (e) {
        console.error("Error formatting date:", isoString, e);
        // Fallback to returning the original string if parsing fails.
        return isoString;
    }
};


// --- React Components ---

const Toast = ({ message, type, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 3000);
        return () => clearTimeout(timer);
    }, [onClose]);
    const bgColor = type === 'success' ? 'bg-green-500' : 'bg-red-500';
    const Icon = type === 'success' ? CheckCircle : AlertCircle;
    return (
        <div className={`fixed bottom-5 right-5 ${bgColor} text-white p-4 rounded-lg shadow-lg flex items-center z-50`}>
            <Icon className="mr-3" />
            <span>{message}</span>
            <button onClick={onClose} className="ml-4 text-xl font-bold">&times;</button>
        </div>
    );
};

const LoadingSpinner = ({ message = "載入中..." }) => (
    <div className="fixed inset-0 bg-white bg-opacity-75 flex justify-center items-center z-50 backdrop-blur-sm">
        <div className="flex flex-col items-center">
            <svg className="animate-spin h-12 w-12 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-lg text-gray-700 mt-4">{message}</p>
        </div>
    </div>
);

const LoginPage = ({ onLogin, settings, isSetupMode }) => {
    const [account, setAccount] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState(null);

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);

        if (isSetupMode) {
            if (account === 'admin' && password === 'admin1234') {
                setToast({ message: '預設管理員登入成功！請完成系統設定。', type: 'success' });
                onLogin({ account: 'admin', role: 'Admin', name: '初始管理員' }, true);
            } else {
                setToast({ message: '帳號或密碼錯誤', type: 'error' });
            }
            setIsLoading(false);
            return;
        }

        try {
            const response = await fetch(GAS_API_URL, {
                method: 'POST',
                redirect: 'follow', // Handle potential redirects from GAS
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'loginUser', payload: { account, password } })
            });

            if (!response.ok) {
                let errorMsg = `登入失敗，伺服器錯誤: ${response.status}`;
                try {
                    const errorResult = await response.json();
                    errorMsg = errorResult.message || errorMsg;
                } catch (jsonError) {
                    // Body might not be JSON, stick with the status code message
                }
                throw new Error(errorMsg);
            }

            const result = await response.json();

            if (result.status === 'success' && result.data) {
                setToast({ message: '登入成功！', type: 'success' });
                onLogin(result.data);
            } else {
                throw new Error(result.message || '帳號或密碼錯誤');
            }
        } catch (error) {
            console.error("Login error:", error);
            setToast({ message: error.toString(), type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col justify-center items-center font-sans p-4">
            {isLoading && <LoadingSpinner message="驗證中..." />}
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
            <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-lg">
                <h1 className="text-3xl font-bold text-center text-gray-800 mb-2">{settings.siteTitle || "設備借用預約系統"}</h1>
                <p className="text-center text-gray-500 mb-6">請登入以繼續</p>
                {isSetupMode && (
                    <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-6 rounded-md" role="alert">
                      <p className="font-bold">系統初始設定</p>
                      <p>請使用預設帳號 <strong>admin</strong> 和密碼 <strong>admin1234</strong> 登入以完成設定。</p>
                    </div>
                )}
                <form onSubmit={handleLogin}>
                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="username">帳號</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <input id="username" type="text" value={account} onChange={(e) => setAccount(e.target.value)} className="shadow-sm appearance-none border rounded-lg w-full py-3 pl-10 pr-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="請輸入您的帳號" required />
                        </div>
                    </div>
                    <div className="mb-6">
                        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">密碼</label>
                        <div className="relative">
                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="shadow-sm appearance-none border rounded-lg w-full py-3 pl-10 pr-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="請輸入您的密碼" required />
                        </div>
                    </div>
                    <div className="flex items-center justify-center">
                        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg focus:outline-none focus:shadow-outline transition-transform transform hover:scale-105">登入系統</button>
                    </div>
                </form>
            </div>
            <footer className="absolute bottom-4 text-center text-gray-500 text-sm">© 2025 設備借用預約系統 | 版本 2.4 (Google Sheets)</footer>
        </div>
    );
};

const App = () => {
    const [user, setUser] = useState(null);
    const [isSetupMode, setIsSetupMode] = useState(false);
    const [currentView, setCurrentView] = useState('calendar');
    const [currentDate, setCurrentDate] = useState(new Date());
    
    const [settings, setSettings] = useState({
        siteTitle: '設備借用預約系統',
        googleSheetUrl: '', // This will now store the Sheet ID
        equipment: [],
        bookingWindowDays: 30,
        weeklyAvailability: initialWeeklyAvailability(),
        appointmentDuration: 40,
        defaultBreakMinutes: 10,
        periods: [],
    });
    const [reservations, setReservations] = useState([]);
    
    const [isLoading, setIsLoading] = useState(true);
    const [toast, setToast] = useState(null);
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [dayPeriodModal, setDayPeriodModal] = useState(null);
    const [reservationToCancel, setReservationToCancel] = useState(null);

    // --- Data Fetching and Mutation ---
    const fetchData = useCallback(async () => {
        if (GAS_API_URL === "YOUR_GOOGLE_APPS_SCRIPT_URL") {
            setIsLoading(false);
            setToast({ message: "系統尚未設定 Google Apps Script 網址", type: "error"});
            setIsSetupMode(true); // 強制進入設定模式
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch(`${GAS_API_URL}?action=getAllData`);
            const result = await response.json();

            if (result.status === 'success') {
                const fetchedSettings = result.data.settings;
                const fetchedReservations = result.data.reservations;

                const newSettings = {
                    ...settings, // 保留預設值
                    ...fetchedSettings,
                    periods: generatePeriodsFromAvailability(fetchedSettings.weeklyAvailability, fetchedSettings.appointmentDuration)
                };
                
                setSettings(newSettings);
                setReservations(fetchedReservations || []);

                if (!newSettings.googleSheetUrl) {
                    setIsSetupMode(true);
                } else {
                    setIsSetupMode(false);
                }
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error("Fetch data error:", error);
            setToast({ message: `讀取資料失敗: ${error.message}`, type: "error" });
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const postData = async (action, payload) => {
        setIsLoading(true);
        try {
            const response = await fetch(GAS_API_URL, {
                method: 'POST',
                redirect: 'follow',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // GAS Web App 的特殊要求
                body: JSON.stringify({ action, payload })
            });
            const result = await response.json();

            if (result.status === 'success') {
                setToast({ message: result.message, type: 'success' });
                // 成功後，更新前端狀態
                const updatedSettings = result.data.settings;
                const updatedReservations = result.data.reservations;
                
                const newSettings = {
                    ...settings,
                    ...updatedSettings,
                    periods: generatePeriodsFromAvailability(updatedSettings.weeklyAvailability, updatedSettings.appointmentDuration)
                };
                
                setSettings(newSettings);
                setReservations(updatedReservations || []);

                return { success: true };
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error(`Action ${action} error:`, error);
            setToast({ message: `操作失敗: ${error.message}`, type: 'error' });
            return { success: false, message: error.message };
        } finally {
            setIsLoading(false);
        }
    };

    const calendarData = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
        const blanks = Array.from({ length: firstDay }, (_, i) => null);
        return [...blanks, ...days];
    }, [currentDate]);

    const handleLogin = (loggedInUser, isSetupLogin = false) => {
        setUser(loggedInUser);
        if (isSetupLogin) {
            setCurrentView('admin');
        }
    };

    const handleLogout = () => {
        setUser(null);
        setCurrentView('calendar');
    };

    const changeMonth = (offset) => {
        setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    };

    const handleSlotClick = (date, period, equipment) => {
        const now = new Date();
        const slotDate = new Date(date);
        const periodInfo = settings.periods.find(p => p.period === period);
        if (!periodInfo) return;
        
        const [hour, minute] = periodInfo.start.split(':');
        slotDate.setHours(hour, minute, 0, 0);

        if (slotDate < now) {
            setToast({ message: '無法預約過去的時段', type: 'error' });
            return;
        }
        setDayPeriodModal(null);
        setSelectedSlot({ date, period, equipment });
    };
    
    const handleConfirmReservation = async () => {
        if (!selectedSlot) return { success: false, message: '沒有選擇時段' };
        
        const reservationData = {
            userId: user.account,
            userName: user.name,
            equipmentId: selectedSlot.equipment.id,
            equipmentName: selectedSlot.equipment.name,
            date: selectedSlot.date,
            period: selectedSlot.period,
        };
        
        return await postData('addReservation', reservationData);
    };
    
    const handleCancelReservation = async () => {
        if (!reservationToCancel) return;
        await postData('deleteReservation', { id: reservationToCancel.id });
        setReservationToCancel(null);
    };

    if (isLoading && !user) {
        return <LoadingSpinner message="正在從 Google Sheets 讀取資料..." />;
    }

    if (!user) {
        return <LoginPage onLogin={handleLogin} settings={settings} isSetupMode={isSetupMode} />;
    }

    return (
        <div className="min-h-screen bg-gray-50 font-sans text-gray-800">
            {isLoading && <LoadingSpinner />}
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
            
            {selectedSlot && (
                <ConfirmationModal 
                    slotInfo={selectedSlot}
                    settings={settings}
                    onClose={() => setSelectedSlot(null)}
                    onConfirm={handleConfirmReservation}
                    setToast={setToast}
                />
            )}
            
            {dayPeriodModal && (
                <DayPeriodModal 
                    data={dayPeriodModal}
                    onClose={() => setDayPeriodModal(null)}
                    settings={settings}
                    reservations={reservations}
                    user={user}
                    onReserveClick={handleSlotClick}
                />
            )}

            {reservationToCancel && (
                <CancelConfirmationModal
                    reservation={reservationToCancel}
                    settings={settings}
                    onClose={() => setReservationToCancel(null)}
                    onConfirm={handleCancelReservation}
                />
            )}

            <header className="bg-white shadow-md p-4 flex justify-between items-center">
                <h1 className="text-2xl font-bold text-blue-600">{settings.siteTitle}</h1>
                <div className="flex items-center gap-4">
                    <span className="font-semibold">你好, {user.name} ({user.role === 'Admin' ? '管理員' : '教師'})</span>
                    <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition">
                        <LogOut size={18} /> 登出
                    </button>
                </div>
            </header>

            <nav className="bg-white border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-start gap-4">
                        <NavButton icon={<Calendar size={18} />} text="預約行事曆" active={currentView === 'calendar'} onClick={() => setCurrentView('calendar')} disabled={isSetupMode} />
                        <NavButton icon={<List size={18} />} text="我的預約" active={currentView === 'my_reservations'} onClick={() => setCurrentView('my_reservations')} disabled={isSetupMode} />
                        {user.role === 'Admin' && (
                            <NavButton icon={<Settings size={18} />} text="管理員後台" active={currentView === 'admin'} onClick={() => setCurrentView('admin')} />
                        )}
                    </div>
                </div>
            </nav>

            <main className="p-4 md:p-8">
                {currentView === 'calendar' && <CalendarView currentDate={currentDate} changeMonth={changeMonth} calendarData={calendarData} settings={settings} reservations={reservations} onPeriodClick={(dateStr, period) => setDayPeriodModal({dateStr, period})} />}
                {currentView === 'my_reservations' && <MyReservationsView user={user} reservations={reservations} settings={settings} onCancelClick={(reservation) => setReservationToCancel(reservation)} />}
                {currentView === 'admin' && user.role === 'Admin' && <AdminDashboard settings={settings} reservations={reservations} onCancelClick={(reservation) => setReservationToCancel(reservation)} setToast={setToast} postData={postData} isSetupMode={isSetupMode} />}
            </main>
            
            <footer className="fixed bottom-0 left-0 right-0 bg-white border-t p-2 text-center text-gray-500 text-sm">© 2025 設備借用預約系統 | 版本 2.4 (Google Sheets)</footer>
        </div>
    );
};

// ... 其他子元件 (NavButton, ConfirmationModal, etc.) 維持不變或稍作調整 ...
// 以下是所有子元件，大部分與前一版本相同

const NavButton = ({ icon, text, active, onClick, disabled }) => (
    <button onClick={onClick} className={`flex items-center gap-2 px-3 py-3 text-sm font-medium border-b-2 transition-colors ${active ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`} disabled={disabled}>
        {icon} {text}
    </button>
);

const ConfirmationModal = ({ slotInfo, settings, onClose, onConfirm, setToast }) => {
    const [isConfirming, setIsConfirming] = useState(false);
    const periodInfo = settings.periods.find(p => p.period === slotInfo.period);

    const handleConfirmClick = async () => {
        setIsConfirming(true);
        const result = await onConfirm();
        if (result.success) {
            // Toast 由外層的 postData 處理
            onClose();
        }
        // 若失敗，Toast 也由外層處理
        setIsConfirming(false);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-40">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg">
                <h2 className="text-2xl font-bold mb-4">確認預約</h2>
                <p className="mb-2"><strong>日期：</strong>{slotInfo.date}</p>
                <p className="mb-2"><strong>節次：</strong>第 {slotInfo.period} 節 ({periodInfo ? `${periodInfo.start} - ${periodInfo.end}` : ''})</p>
                <p className="mb-6"><strong>設備：</strong>{slotInfo.equipment.name}</p>
                <div className="flex justify-end gap-4">
                    <button onClick={onClose} disabled={isConfirming} className="px-4 py-2 bg-gray-300 rounded-md hover:bg-gray-400 disabled:opacity-50">取消</button>
                    <button onClick={handleConfirmClick} disabled={isConfirming} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                        {isConfirming && <Loader2 className="animate-spin" size={16} />}
                        {isConfirming ? '處理中...' : '確認送出'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const CancelConfirmationModal = ({ reservation, settings, onClose, onConfirm }) => {
    const [isCancelling, setIsCancelling] = useState(false);
    const periodInfo = settings.periods.find(p => p.period == reservation.period);

    const handleConfirmClick = async () => {
        setIsCancelling(true);
        await onConfirm();
        // onClose 由外層處理
        setIsCancelling(false);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg">
                <h2 className="text-2xl font-bold mb-4">取消預約</h2>
                <p className="mb-6">您確定要取消這筆預約嗎？</p>
                <div className="bg-gray-50 p-4 rounded-md mb-6 text-sm">
                    <p><strong>預約人:</strong> {reservation.userName}</p>
                    <p><strong>日期:</strong> {formatISODateToYYYYMMDD(reservation.date)}</p>
                    <p><strong>節次:</strong> 第 {reservation.period} 節 ({periodInfo ? `${periodInfo.start} - ${periodInfo.end}` : ''})</p>
                    <p><strong>設備:</strong> {reservation.equipmentName}</p>
                </div>
                <div className="flex justify-end gap-4">
                    <button onClick={onClose} disabled={isCancelling} className="px-4 py-2 bg-gray-300 rounded-md hover:bg-gray-400 disabled:opacity-50">返回</button>
                    <button onClick={handleConfirmClick} disabled={isCancelling} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                        {isCancelling && <Loader2 className="animate-spin" size={16} />}
                        {isCancelling ? '取消中...' : '確認取消'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const CalendarView = ({ currentDate, changeMonth, calendarData, settings, reservations, onPeriodClick }) => {
    const header = ["日", "一", "二", "三", "四", "五", "六"];
    const [selectedEquipmentId, setSelectedEquipmentId] = useState('all');

    const getOverallPeriodStatus = useCallback((dateStr, period) => {
        const date = new Date(dateStr);
        const dayOfWeek = date.getDay();
        const dayAvailability = settings.weeklyAvailability.find(d => d.dayOfWeek == dayOfWeek);
        const periodInfo = settings.periods.find(p => p.period === period);

        if (!dayAvailability || !dayAvailability.isEnabled || !periodInfo) return 'unavailable';
        
        const timeToMinutes = (timeStr) => {
            const [h, m] = timeStr.split(':').map(Number);
            return h * 60 + m;
        };

        const isPeriodInDaySchedule = (dayAvailability.slots || []).some(range => {
            if (!range.start || !range.end) return false;
            const periodStartMinutes = timeToMinutes(periodInfo.start);
            const rangeStartMinutes = timeToMinutes(range.start);
            const rangeEndMinutes = timeToMinutes(range.end);
            return periodStartMinutes >= rangeStartMinutes && periodStartMinutes < rangeEndMinutes;
        });

        if (!isPeriodInDaySchedule) return 'unavailable';

        const now = new Date();
        const slotDateTime = new Date(dateStr);
        const [hour, minute] = periodInfo.start.split(':');
        slotDateTime.setHours(hour, minute, 0, 0);

        if (slotDateTime < now) return 'expired';

        const today = new Date();
        today.setHours(0,0,0,0);
        const bookingLimit = settings.bookingWindowDays || 30;
        const limitDate = new Date(today);
        limitDate.setDate(today.getDate() + bookingLimit);
        if (date >= limitDate) return 'unavailable';

        const equipmentToFilter = selectedEquipmentId === 'all'
            ? settings.equipment
            : settings.equipment.filter(e => e.id === selectedEquipmentId);
        
        if (equipmentToFilter.length === 0) return 'unavailable';

        let totalAvailable = 0;
        let totalReserved = 0;

        equipmentToFilter.forEach(equip => {
            totalAvailable += Number(equip.total);
            totalReserved += reservations.filter(r => formatISODateToYYYYMMDD(r.date) === dateStr && r.period == period && r.equipmentId === equip.id).length;
        });

        if (totalReserved >= totalAvailable) return 'fully-booked';
        return 'available';
    }, [settings, reservations, selectedEquipmentId]);
    
    return (
        <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-4 gap-4">
                <div className="flex items-center">
                    <button onClick={() => changeMonth(-1)} className="p-2 rounded-full hover:bg-gray-200"><ArrowLeft /></button>
                    <h2 className="text-2xl font-bold mx-4">{currentDate.getFullYear()} 年 {currentDate.getMonth() + 1} 月</h2>
                    <button onClick={() => changeMonth(1)} className="p-2 rounded-full hover:bg-gray-200"><ArrowRight /></button>
                </div>
                <div>
                    <label htmlFor="equipment-filter" className="sr-only">篩選設備</label>
                    <select 
                        id="equipment-filter" 
                        value={selectedEquipmentId} 
                        onChange={e => setSelectedEquipmentId(e.target.value)}
                        className="w-full sm:w-auto p-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    >
                        <option value="all">所有設備</option>
                        {settings.equipment.map(equip => (
                            <option key={equip.id} value={equip.id}>{equip.name}</option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center font-semibold text-gray-600">
                {header.map(day => <div key={day} className="py-2">{day}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
                {calendarData.map((day, index) => {
                    if (!day) return <div key={index} className="bg-gray-50 rounded-md"></div>;
                    
                    const dateStr = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                    
                    return (
                        <div key={index} className="border rounded-md p-1 min-h-[120px] bg-white">
                            <div className="font-bold text-right text-sm pr-1">{day}</div>
                            <div className="mt-1 grid grid-cols-2 gap-0.5 text-xs">
                                {settings.periods.map(p => {
                                    const status = getOverallPeriodStatus(dateStr, p.period);
                                    const statusClasses = {
                                        'expired': 'bg-gray-200 text-gray-500 cursor-not-allowed',
                                        'unavailable': 'bg-gray-200 text-gray-500 cursor-not-allowed',
                                        'fully-booked': 'bg-red-200 text-red-700 cursor-pointer hover:bg-red-300',
                                        'available': 'bg-green-100 text-green-800 cursor-pointer hover:bg-green-200'
                                    };
                                    const isClickable = status !== 'expired' && status !== 'unavailable';
                                    return (
                                        <div 
                                            key={p.period} 
                                            onClick={isClickable ? () => onPeriodClick(dateStr, p.period) : undefined} 
                                            className={`text-center truncate p-1 rounded ${statusClasses[status]}`}
                                        >
                                            {p.period}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
             <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                <span className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-green-100 border border-gray-300"></div>可預約</span>
                <span className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-red-200 border border-gray-300"></div>已額滿</span>
                <span className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-gray-200 border border-gray-300"></div>不開放/已過期</span>
            </div>
        </div>
    );
};

const DayPeriodModal = ({ data, onClose, settings, reservations, user, onReserveClick }) => {
    const { dateStr, period } = data;
    const periodInfo = settings.periods.find(p => p.period === period);

    const getStatus = (equipment) => {
        const now = new Date();
        const slotDateTime = new Date(`${dateStr}T${periodInfo.start}`);
        if (slotDateTime < now) return { status: 'expired', text: '已過期', isClickable: false };

        const reservedCount = reservations.filter(r => formatISODateToYYYYMMDD(r.date) === dateStr && r.period == period && r.equipmentId === equipment.id).length;
        const totalAvailable = Number(equipment.total);
        
        const myReservation = reservations.find(r => formatISODateToYYYYMMDD(r.date) === dateStr && r.period == period && r.equipmentId === equipment.id && r.userId === user.account);
        if (myReservation) return { status: 'my-reservation', text: `我的預約 (${user.name})`, isClickable: false };

        if (reservedCount >= totalAvailable) return { status: 'reserved', text: `已預約 (${reservedCount}/${totalAvailable})`, isClickable: false };
        
        return { status: 'available', text: `可預約 (${totalAvailable - reservedCount}/${totalAvailable})`, isClickable: true };
    };

    if (!periodInfo) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-40" onClick={onClose}>
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold">預約時段</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200"><X size={20} /></button>
                </div>
                <p className="mb-1"><strong>日期：</strong>{dateStr}</p>
                <p className="mb-4"><strong>節次：</strong>第 {period} 節 ({periodInfo.start} - {periodInfo.end})</p>
                <div className="space-y-2">
                    <h3 className="font-semibold">設備狀態：</h3>
                    {settings.equipment.map(equip => {
                        const { status, text, isClickable } = getStatus(equip);
                        const statusClasses = {
                            'expired': 'bg-gray-300 text-gray-600',
                            'unavailable': 'bg-gray-200 text-gray-600',
                            'reserved': 'bg-red-200 text-red-800',
                            'my-reservation': 'bg-green-200 text-green-800',
                            'available': 'bg-blue-200 text-blue-800'
                        };
                        return (
                            <div key={equip.id} className={`flex justify-between items-center p-3 rounded-md ${statusClasses[status]}`}>
                                <span>{equip.name}: {text}</span>
                                {isClickable && <button onClick={() => onReserveClick(dateStr, period, equip)} className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">預約</button>}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

const MyReservationsView = ({ user, reservations, settings, onCancelClick }) => {
    const myReservations = useMemo(() => {
        return reservations
            .filter(r => r.userId === user.account)
            .map(r => {
                const now = new Date();
                const localDateStr = formatISODateToYYYYMMDD(r.date);
                const [year, month, day] = localDateStr.split('-').map(Number);
                const periodInfo = settings.periods.find(p => p.period == r.period) || { start: '00:00' };
                const [hour, minute] = periodInfo.start.split(':');
                const reservationDate = new Date(year, month - 1, day, hour, minute);
                return { ...r, isExpired: reservationDate < now };
            })
            .sort((a, b) => new Date(b.date) - new Date(a.date) || a.period - b.period);
    }, [user, reservations, settings]);

    return (
        <div className="bg-white p-6 rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold mb-4">我的預約紀錄</h2>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">預約日期</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">節次</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">設備名稱</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">狀態</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {myReservations.length === 0 ? (
                            <tr><td colSpan="5" className="text-center py-4">沒有預約紀錄</td></tr>
                        ) : (
                            myReservations.map(r => (
                                <tr key={r.id}>
                                    <td className="px-6 py-4 whitespace-nowrap">{formatISODateToYYYYMMDD(r.date)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">第 {r.period} 節</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{r.equipmentName}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {r.isExpired ? <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">已過期</span> : <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">有效</span>}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {!r.isExpired && (
                                            <button onClick={() => onCancelClick(r)} className="text-red-600 hover:text-red-900 flex items-center gap-1">
                                                <Trash2 size={16} /> 取消預約
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const AdminDashboard = ({ settings, reservations, onCancelClick, setToast, postData, isSetupMode }) => {
    const [activeTab, setActiveTab] = useState(isSetupMode ? 'system' : 'reservations');
    const [localSettings, setLocalSettings] = useState(settings);
    const [showExportModal, setShowExportModal] = useState(false);
    const [customDuration, setCustomDuration] = useState('');
    const [durationSelect, setDurationSelect] = useState('');
    const [customBreak, setCustomBreak] = useState('');
    const [breakSelect, setBreakSelect] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

    useEffect(() => {
        setLocalSettings(settings);
        const duration = settings.appointmentDuration;
        if (duration == 40 || duration == 50) {
            setDurationSelect(String(duration));
            setCustomDuration('');
        } else {
            setDurationSelect('custom');
            setCustomDuration(String(duration));
        }
        
        const breakTime = settings.defaultBreakMinutes;
        if (breakTime == 10 || breakTime == 20) {
            setBreakSelect(String(breakTime));
            setCustomBreak('');
        } else {
            setBreakSelect('custom');
            setCustomBreak(String(breakTime));
        }

    }, [settings]);

    useEffect(() => {
        if (isSetupMode) {
            setActiveTab('system');
        }
    }, [isSetupMode]);

    const handleDurationSelectChange = (e) => {
        const value = e.target.value;
        setDurationSelect(value);
        if (value !== 'custom') {
            setLocalSettings(prev => ({...prev, appointmentDuration: parseInt(value)}));
            setCustomDuration('');
        }
    };
    
    const handleCustomDurationChange = (e) => {
        const value = e.target.value;
        setCustomDuration(value);
        setLocalSettings(prev => ({...prev, appointmentDuration: parseInt(value) || 0}));
    };

    const handleBreakSelectChange = (e) => {
        const value = e.target.value;
        setBreakSelect(value);
        if (value !== 'custom') {
            setLocalSettings(prev => ({...prev, defaultBreakMinutes: parseInt(value)}));
            setCustomBreak('');
        }
    };
    
    const handleCustomBreakChange = (e) => {
        const value = e.target.value;
        setCustomBreak(value);
        setLocalSettings(prev => ({...prev, defaultBreakMinutes: parseInt(value) || 0}));
    };

    const handleWeeklyAvailabilityChange = (dayIndex, key, value) => {
        const newWeeklyAvailability = [...localSettings.weeklyAvailability];
        newWeeklyAvailability[dayIndex] = { ...newWeeklyAvailability[dayIndex], [key]: value };
        setLocalSettings(prev => ({ ...prev, weeklyAvailability: newWeeklyAvailability }));
    };

    const handleSlotChange = (dayIndex, slotIndex, key, value) => {
        const newWeeklyAvailability = [...localSettings.weeklyAvailability];
        newWeeklyAvailability[dayIndex].slots[slotIndex] = { ...newWeeklyAvailability[dayIndex].slots[slotIndex], [key]: value };
        setLocalSettings(prev => ({ ...prev, weeklyAvailability: newWeeklyAvailability }));
    };

    const addSlot = (dayIndex) => {
        const newWeeklyAvailability = [...localSettings.weeklyAvailability];
        const daySlots = newWeeklyAvailability[dayIndex].slots || [];
        const lastSlot = daySlots.length > 0 ? daySlots[daySlots.length - 1] : null;

        const addMinutesToTime = (timeStr, minutes) => {
            if (!timeStr) return "08:00";
            const [h, m] = timeStr.split(':').map(Number);
            const date = new Date();
            date.setHours(h, m + minutes, 0, 0);
            return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        };

        const newStartTime = lastSlot ? addMinutesToTime(lastSlot.end, localSettings.defaultBreakMinutes || 10) : '08:00';
        const newEndTime = addMinutesToTime(newStartTime, localSettings.appointmentDuration || 45);

        newWeeklyAvailability[dayIndex].slots = [...daySlots, { start: newStartTime, end: newEndTime }];
        setLocalSettings(prev => ({ ...prev, weeklyAvailability: newWeeklyAvailability }));
    };

    const removeSlot = (dayIndex, slotIndex) => {
        const newWeeklyAvailability = [...localSettings.weeklyAvailability];
        newWeeklyAvailability[dayIndex].slots.splice(slotIndex, 1);
        setLocalSettings(prev => ({ ...prev, weeklyAvailability: newWeeklyAvailability }));
    };
    
    const copySlotsToAll = (sourceDayIndex) => {
        const sourceSlots = localSettings.weeklyAvailability[sourceDayIndex].slots;
        const newWeeklyAvailability = localSettings.weeklyAvailability.map((day, index) => {
            if (day.isEnabled && index !== sourceDayIndex) {
                return { ...day, slots: JSON.parse(JSON.stringify(sourceSlots)) };
            }
            return day;
        });
        setLocalSettings(prev => ({ ...prev, weeklyAvailability: newWeeklyAvailability }));
        setToast({ message: `已將 ${localSettings.weeklyAvailability[sourceDayIndex].dayName} 的時段複製到所有啟用的日期`, type: 'success' });
    };
    
    const handleEquipmentChange = (index, key, value) => {
        const newEquipment = [...localSettings.equipment];
        newEquipment[index] = { ...newEquipment[index], [key]: value };
        if (key === 'total') newEquipment[index][key] = Math.max(1, parseInt(value) || 1);
        setLocalSettings(prev => ({ ...prev, equipment: newEquipment }));
    };

    const addEquipment = () => {
        setLocalSettings(prev => ({ ...prev, equipment: [...prev.equipment, { id: `new_equip_${Date.now()}`, name: '新設備', total: 1 }] }));
    };
    
    const removeEquipment = (index) => {
        setLocalSettings(prev => ({ ...prev, equipment: prev.equipment.filter((_, i) => i !== index) }));
    };

    const saveSettings = async () => {
        if (isSetupMode && (!localSettings.googleSheetUrl || localSettings.googleSheetUrl.trim() === '')) {
            setToast({ message: '請先提供有效的 Google 試算表 ID', type: 'error' });
            return;
        }
        await postData('saveSettings', localSettings);
    };
    
     const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const allReservationsSorted = useMemo(() => {
        let sortableItems = [...reservations];
        sortableItems.sort((a, b) => {
            let aValue = a[sortConfig.key];
            let bValue = b[sortConfig.key];

            if (sortConfig.key === 'date') {
                aValue = new Date(a.date);
                bValue = new Date(b.date);
            }

            if (sortConfig.key === 'period') {
                aValue = Number(a.period);
                bValue = Number(b.period);
            }
            
            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return sortableItems.map(r => {
            const now = new Date();
            const localDateStr = formatISODateToYYYYMMDD(r.date);
            const [year, month, day] = localDateStr.split('-').map(Number);
            const periodInfo = settings.periods.find(p => p.period == r.period) || { start: '00:00' };
            const [hour, minute] = periodInfo.start.split(':');
            const reservationDate = new Date(year, month - 1, day, hour, minute);
            return { ...r, isExpired: reservationDate < now };
        });
    }, [reservations, settings, sortConfig]);

    const printReservations = () => {
        const printWindow = window.open('', '_blank');
        printWindow.document.write('<html><head><title>所有預約紀錄</title><style>body{font-family:sans-serif;} table{width:100%; border-collapse:collapse;} th,td{border:1px solid #ddd; padding:8px; text-align:left;} th{background-color:#f2f2f2;}</style></head><body><h1>所有預約紀錄</h1><table><thead><tr><th>預約人</th><th>預約日期</th><th>節次</th><th>設備名稱</th><th>狀態</th></tr></thead><tbody>');
        allReservationsSorted.forEach(r => {
            const periodInfo = settings.periods.find(p => p.period == r.period);
            printWindow.document.write(`<tr><td>${r.userName}</td><td>${formatISODateToYYYYMMDD(r.date)}</td><td>第 ${r.period} 節 (${periodInfo ? `${periodInfo.start} - ${periodInfo.end}` : ''})</td><td>${r.equipmentName}</td><td>${r.isExpired ? '已過期' : '有效'}</td></tr>`);
        });
        printWindow.document.write('</tbody></table></body></html>');
        printWindow.document.close();
        printWindow.print();
    };

    const SortableHeader = ({ label, sortKey }) => (
        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer" onClick={() => handleSort(sortKey)}>
            <div className="flex items-center gap-2">
                {label}
                <ArrowUpDown size={14} />
            </div>
        </th>
    );

    return (
        <>
        {showExportModal && <ExportModal reservations={allReservationsSorted} settings={settings} onClose={() => setShowExportModal(false)} setToast={setToast}/>}
        <div className="flex flex-col md:flex-row gap-8">
            <aside className="md:w-1/4">
                <ul className="space-y-2">
                    <li><AdminTabButton text="預約管理" active={activeTab === 'reservations'} onClick={() => setActiveTab('reservations')} disabled={isSetupMode} /></li>
                    <li><AdminTabButton text="設備管理" active={activeTab === 'equipment'} onClick={() => setActiveTab('equipment')} disabled={isSetupMode} /></li>
                    <li><AdminTabButton text="課表管理" active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} disabled={isSetupMode} /></li>
                    <li><AdminTabButton text="系統設定" active={activeTab === 'system'} onClick={() => setActiveTab('system')} /></li>
                </ul>
            </aside>
            <div className="flex-1 bg-white p-6 rounded-lg shadow-lg">
                {isSetupMode && (
                    <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 mb-6 rounded-md flex items-start gap-3">
                        <Info className="flex-shrink-0 mt-1" />
                        <div>
                            <p className="font-bold">歡迎使用！請完成系統初始化設定。</p>
                            <p>請在下方的「Google 試算表 ID」欄位中，填入您的試算表 ID，並點擊「儲存變更」以啟用系統所有功能。</p>
                        </div>
                    </div>
                )}
                {activeTab === 'reservations' && (
                    <div>
                        <h3 className="text-xl font-bold mb-4">所有預約紀錄</h3>
                        <div className="flex gap-2 mb-4">
                            <button onClick={() => setShowExportModal(true)} className="flex items-center gap-2 px-3 py-2 bg-green-100 text-green-700 rounded-md hover:bg-green-200"><Download size={16} /> 匯出 CSV</button>
                            <button onClick={printReservations} className="flex items-center gap-2 px-3 py-2 bg-gray-200 rounded-md hover:bg-gray-300"><Printer size={16} /> 列印</button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <SortableHeader label="預約人" sortKey="userName" />
                                        <SortableHeader label="日期" sortKey="date" />
                                        <SortableHeader label="節次" sortKey="period" />
                                        <SortableHeader label="設備" sortKey="equipmentName" />
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">狀態</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {allReservationsSorted.map(r => (<tr key={r.id}><td className="px-4 py-2 whitespace-nowrap">{r.userName}</td><td className="px-4 py-2 whitespace-nowrap">{formatISODateToYYYYMMDD(r.date)}</td><td className="px-4 py-2 whitespace-nowrap">第 {r.period} 節</td><td className="px-4 py-2 whitespace-nowrap">{r.equipmentName}</td><td className="px-4 py-2 whitespace-nowrap">{r.isExpired ? '已過期' : '有效'}</td><td className="px-4 py-2 whitespace-nowrap">{!r.isExpired && <button onClick={() => onCancelClick(r)} className="text-red-600 hover:text-red-900"><Trash2 size={16} /></button>}</td></tr>))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
                {activeTab === 'equipment' && (
                    <div>
                        <h3 className="text-xl font-bold mb-4">設備管理</h3>
                        <div className="space-y-4">
                            {localSettings.equipment.map((equip, index) => (<div key={index} className="flex items-center gap-4 p-4 border rounded-lg"><input type="text" value={equip.name} onChange={e => handleEquipmentChange(index, 'name', e.target.value)} className="flex-grow p-2 border rounded-md" placeholder="設備名稱" /><input type="number" value={equip.total} onChange={e => handleEquipmentChange(index, 'total', e.target.value)} className="w-24 p-2 border rounded-md" placeholder="數量" min="1" /><button onClick={() => removeEquipment(index)} className="p-2 text-red-500 hover:bg-red-100 rounded-full"><Trash2 size={18} /></button></div>))}
                            <button onClick={addEquipment} className="flex items-center gap-2 px-3 py-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200"><Plus size={16} /> 新增設備</button>
                        </div>
                        <button onClick={saveSettings} className="mt-6 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"><Save size={16} /> 儲存變更</button>
                    </div>
                )}
                {activeTab === 'schedule' && (
                    <div>
                        <h3 className="text-xl font-bold mb-4">課表管理</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            <div><label className="block font-medium mb-1">預設上課時間</label>
                                <div className="flex gap-2">
                                    <select value={durationSelect} onChange={handleDurationSelectChange} className="p-2 border rounded-md">
                                        <option value="40">40 分鐘</option>
                                        <option value="50">50 分鐘</option>
                                        <option value="custom">自訂</option>
                                    </select>
                                    {durationSelect === 'custom' && <input type="number" value={customDuration} onChange={handleCustomDurationChange} className="p-2 border rounded-md w-24" placeholder="分鐘"/>}
                                </div>
                            </div>
                            <div><label className="block font-medium mb-1">預設下課時間</label>
                                <div className="flex gap-2">
                                    <select value={breakSelect} onChange={handleBreakSelectChange} className="p-2 border rounded-md">
                                        <option value="10">10 分鐘</option>
                                        <option value="20">20 分鐘</option>
                                        <option value="custom">自訂</option>
                                    </select>
                                    {breakSelect === 'custom' && <input type="number" value={customBreak} onChange={handleCustomBreakChange} className="p-2 border rounded-md w-24" placeholder="分鐘"/>}
                                </div>
                            </div>
                        </div>
                        <div className="space-y-4">
                        {localSettings.weeklyAvailability.map((day, dayIndex) => (
                            <div key={day.dayOfWeek} className="flex gap-4 items-start">
                                <label className="flex items-center space-x-2 mt-2"><input type="checkbox" checked={day.isEnabled} onChange={e => handleWeeklyAvailabilityChange(dayIndex, 'isEnabled', e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" /> <span className="font-semibold w-12">{day.dayName}</span></label>
                                <div className="flex-1">
                                    {day.isEnabled ? (
                                        <div className="space-y-2">
                                            {(day.slots || []).map((slot, slotIndex) => (
                                                <div key={slotIndex} className="flex items-center gap-2">
                                                    <input type="time" value={slot.start} onChange={e => handleSlotChange(dayIndex, slotIndex, 'start', e.target.value)} className="p-2 border rounded-md w-full" />
                                                    <span>-</span>
                                                    <input type="time" value={slot.end} onChange={e => handleSlotChange(dayIndex, slotIndex, 'end', e.target.value)} className="p-2 border rounded-md w-full" />
                                                    <button onClick={() => removeSlot(dayIndex, slotIndex)} className="p-2 text-red-500 hover:bg-red-100 rounded-full"><Minus size={16} /></button>
                                                    <button onClick={() => copySlotsToAll(dayIndex)} title="將時間複製到所有日期" className="p-2 text-blue-500 hover:bg-blue-100 rounded-full"><Copy size={16} /></button>
                                                </div>
                                            ))}
                                            <button onClick={() => addSlot(dayIndex)} className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"><Plus size={16} /> 新增時段</button>
                                        </div>
                                    ) : <div className="text-gray-500 mt-2">不開放預約</div>}
                                </div>
                            </div>
                        ))}
                        </div>
                        <button onClick={saveSettings} className="mt-6 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"><Save size={16} /> 儲存變更</button>
                    </div>
                )}
                {activeTab === 'system' && (
                    <div>
                        <h3 className="text-xl font-bold mb-4">系統設定</h3>
                        <div className="space-y-4">
                            <div><label className="block font-medium mb-1">網站標題</label><input type="text" value={localSettings.siteTitle} onChange={e => setLocalSettings({...localSettings, siteTitle: e.target.value})} className="w-full p-2 border rounded-md" /></div>
                            <div>
                                <label className="block font-medium mb-1">開放預約天數</label>
                                <input type="number" value={localSettings.bookingWindowDays || 30} onChange={e => setLocalSettings({...localSettings, bookingWindowDays: parseInt(e.target.value)})} className="w-full p-2 border rounded-md" />
                                <p className="text-xs text-gray-500 mt-1">使用者僅能預約從今天起算，未來 N 天內的時段。</p>
                            </div>
                            <div>
                                <label className="block font-medium mb-1">Google 試算表 ID</label>
                                <input type="text" value={localSettings.googleSheetUrl} onChange={e => setLocalSettings({...localSettings, googleSheetUrl: e.target.value})} className="w-full p-2 border rounded-md" placeholder="請輸入您的 Google 試算表 ID" />
                                <p className="text-xs text-gray-500 mt-1">
                                    請從您的 Google 試算表網址中複製 ID，例如：.../spreadsheets/d/<strong className="text-red-500 font-semibold">這一段就是ID</strong>/edit
                                </p>
                            </div>
                        </div>
                        <button onClick={saveSettings} className="mt-6 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"><Save size={16} /> 儲存變更</button>
                    </div>
                )}
            </div>
        </div>
        </>
    );
};

const AdminTabButton = ({ text, active, onClick, disabled }) => (
    <button onClick={onClick} className={`w-full text-left px-4 py-3 rounded-md transition-colors ${active ? 'bg-blue-600 text-white font-semibold' : 'hover:bg-gray-100'} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`} disabled={disabled}>
        {text}
    </button>
);

const ExportModal = ({ reservations, settings, onClose, setToast }) => {
    const availableMonths = useMemo(() => {
        const months = new Set(reservations.map(r => formatISODateToYYYYMMDD(r.date).substring(0, 7))); // YYYY-MM
        return Array.from(months).sort().reverse();
    }, [reservations]);

    const [selectedMonths, setSelectedMonths] = useState([]);

    const handleCheckboxChange = (month) => {
        setSelectedMonths(prev => 
            prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month]
        );
    };

    const handleExport = () => {
        if (selectedMonths.length === 0) {
            setToast({ message: '請至少選擇一個月份', type: 'error' });
            return;
        }

        const dataToExport = reservations.filter(r => selectedMonths.includes(formatISODateToYYYYMMDD(r.date).substring(0, 7)));
        
        const header = ["預約單號", "預約日期", "節次", "開始時間", "結束時間", "預約人帳號", "預約人姓名", "設備ID", "設備名稱", "預約時間戳記"];
        const rows = dataToExport.map(r => {
            const periodInfo = settings.periods.find(p => p.period == r.period) || { start: 'N/A', end: 'N/A' };
            return [r.id, formatISODateToYYYYMMDD(r.date), r.period, periodInfo.start, periodInfo.end, r.userId, r.userName, r.equipmentId, r.equipmentName, r.timestamp]
        });

        let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
        csvContent += header.join(",") + "\r\n";
        rows.forEach(rowArray => {
            let row = rowArray.map(item => `"${String(item).replace(/"/g, '""')}"`).join(",");
            csvContent += row + "\r\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `reservations_${selectedMonths.join('_')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50" onClick={onClose}>
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-4">匯出預約紀錄</h2>
                <p className="mb-4 text-sm text-gray-600">請選擇您要匯出資料的月份（可複選）：</p>
                <div className="max-h-60 overflow-y-auto border rounded-md p-3 space-y-2 mb-4">
                    {availableMonths.length > 0 ? availableMonths.map(month => (
                        <label key={month} className="flex items-center space-x-3 p-2 rounded-md hover:bg-gray-100 cursor-pointer">
                            <input type="checkbox" className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" checked={selectedMonths.includes(month)} onChange={() => handleCheckboxChange(month)} />
                            <span>{month.replace('-', ' 年 ')} 月</span>
                        </label>
                    )) : <p className="text-gray-500">沒有可匯出的紀錄</p>}
                </div>
                <div className="flex justify-end gap-4 mt-6">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-300 rounded-md hover:bg-gray-400">取消</button>
                    <button onClick={handleExport} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50" disabled={availableMonths.length === 0 || selectedMonths.length === 0}>匯出</button>
                </div>
            </div>
        </div>
    );
};

export default App;

