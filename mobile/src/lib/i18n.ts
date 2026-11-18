/**
 * App strings in 9 languages. English is the fallback for any missing key.
 * Add a key to `en` first, then to the other languages.
 */
export const LANGUAGES: { code: string; native: string; english: string; rtl?: boolean }[] = [
  { code: 'en', native: 'English', english: 'English' },
  { code: 'hi', native: 'हिन्दी', english: 'Hindi' },
  { code: 'mr', native: 'मराठी', english: 'Marathi' },
  { code: 'gu', native: 'ગુજરાતી', english: 'Gujarati' },
  { code: 'ta', native: 'தமிழ்', english: 'Tamil' },
  { code: 'te', native: 'తెలుగు', english: 'Telugu' },
  { code: 'bn', native: 'বাংলা', english: 'Bengali' },
  { code: 'kn', native: 'ಕನ್ನಡ', english: 'Kannada' },
  { code: 'ar', native: 'العربية', english: 'Arabic', rtl: true },
];

const en = {
  welcome_back: 'Welcome back', login_mobile: 'Login with your mobile number', company_code: 'Company code', mobile: 'Mobile',
  send_otp: 'Send OTP', verify_login: 'Verify & login', enter_otp: 'Enter the OTP sent to', change: 'Change',
  choose_language: 'Choose your language', change_anytime: 'You can change it anytime', continue: 'Continue',
  hi: 'Hi', punched_in: 'PUNCHED IN', not_punched: 'NOT PUNCHED IN', punch_in: 'Punch in', punch_out: 'Punch out', today_hours: 'today',
  today: 'Today', overdue: 'Overdue', upcoming: 'Upcoming', on_time: 'On time', done: 'Done', todays_tasks: "Today's tasks", see_all: 'See all',
  home: 'Home', tasks: 'Tasks', task: 'Task', chat: 'Chat', me: 'Me',
  to_me: 'To me', by_me: 'By me', team: 'Team', not_started: 'Not started', in_progress: 'In progress',
  checklist: 'Checklist', attachments: 'Attachments & voice note', comments: 'Comments', mark_complete: 'Mark complete', start: 'Start',
  new_task: 'New task', voice_note: 'Voice note', file: 'File', send_whatsapp: 'Send on WhatsApp too', remind_before: 'Remind 1 hour before',
  assign_task: 'Assign task', assign_to: 'Assign to', due: 'Due', priority: 'Priority', repeat: 'Repeat', does_not_repeat: 'Does not repeat',
  high: 'High', medium: 'Medium', low: 'Low', speak_task: 'Speak a task', listening: 'Listening…', create_task: 'Create task', auto_filled: 'Auto-filled',
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', custom: 'Custom', on: 'On', time: 'Time', ends: 'Ends', never: 'Never', rotate_between: 'Rotate between', save_repeat: 'Save repeat', next: 'Next',
  complete_task: 'Complete task', photo_proof: 'Photo proof', location_captured: 'Location captured', remarks: 'Remarks', submit: 'Submit',
  office: 'Office', field: 'Field', wfh: 'Work from home', inside_geofence: 'inside geofence', take_selfie: 'Take selfie',
  my_attendance: 'My attendance', present: 'Present', late: 'Late', leave: 'Leave', hours: 'Hours', working: 'Working', apply_leave: 'Apply leave',
  casual: 'Casual', sick: 'Sick', earned: 'Earned', comp_off: 'Comp-off', type: 'Type', from_to: 'From – to', reason: 'Reason', hand_over: 'Hand over tasks to', send_for_approval: 'Send for approval',
  approvals: 'Approvals', approve: 'Approve', reject: 'Reject', timesheet: 'Timesheet', total: 'TOTAL', billable: 'BILLABLE', start_timer: 'Start timer', stop_timer: 'Stop timer',
  calendar: 'Calendar', synced_gcal: 'Synced with Google Calendar', notifications: 'Notifications', goals: 'Goals', performance: 'Performance', your_score: 'YOUR SCORE',
  leaderboard: 'Leaderboard', attendance: 'Attendance', rating: 'Rating', team_location: 'Team location', ai_suggestions: 'AI suggestions', skip: 'Skip', add: 'Add',
  language: 'Language', google_calendar: 'Google Calendar', connected: 'Connected', privacy: 'Privacy & security', pin_bio: 'PIN · biometric',
  salary_docs: 'Salary slips & documents', logout: 'Logout', message: 'Message…', share_location: 'Share location during work hours',
  save: 'Save', cancel: 'Cancel', retry: 'Retry', nothing_here: 'Nothing here yet', all_caught_up: "You're all caught up", tomorrow: 'Tomorrow', more: 'More',
};
type Dict = Partial<Record<keyof typeof en, string>>;

const hi: Dict = {
  welcome_back: 'वापस स्वागत है', login_mobile: 'अपने मोबाइल नंबर से लॉगिन करें', company_code: 'कंपनी कोड', mobile: 'मोबाइल',
  send_otp: 'OTP भेजें', verify_login: 'वेरिफ़ाई करें और लॉगिन', enter_otp: 'OTP डालें, भेजा गया', change: 'बदलें',
  choose_language: 'अपनी भाषा चुनें', change_anytime: 'आप इसे कभी भी बदल सकते हैं', continue: 'आगे बढ़ें',
  hi: 'नमस्ते', punched_in: 'पंच इन', not_punched: 'पंच इन नहीं', punch_in: 'पंच इन', punch_out: 'पंच आउट', today_hours: 'आज',
  today: 'आज', overdue: 'देरी', upcoming: 'आगामी', on_time: 'समय पर', done: 'पूरा', todays_tasks: 'आज के काम', see_all: 'सभी देखें',
  home: 'होम', tasks: 'काम', task: 'काम', chat: 'चैट', me: 'मैं', to_me: 'मुझे', by_me: 'मेरे द्वारा', team: 'टीम',
  not_started: 'शुरू नहीं', in_progress: 'चल रहा है', checklist: 'चेकलिस्ट', attachments: 'अटैचमेंट और वॉइस नोट', comments: 'टिप्पणियाँ',
  mark_complete: 'पूरा करें', start: 'शुरू करें', new_task: 'नया काम', voice_note: 'वॉइस नोट', file: 'फ़ाइल', send_whatsapp: 'WhatsApp पर भी भेजें',
  remind_before: '1 घंटा पहले याद दिलाएँ', assign_task: 'काम सौंपें', assign_to: 'किसे', due: 'समय सीमा', priority: 'प्राथमिकता', repeat: 'दोहराएँ',
  does_not_repeat: 'दोहराना नहीं', high: 'ज़रूरी', medium: 'मध्यम', low: 'कम', speak_task: 'बोलकर काम बनाएं', listening: 'सुन रहे हैं…', create_task: 'काम बनाएं',
  auto_filled: 'अपने-आप भरा', daily: 'रोज़', weekly: 'साप्ताहिक', monthly: 'मासिक', custom: 'कस्टम', on: 'दिन', time: 'समय', ends: 'खत्म',
  never: 'कभी नहीं', rotate_between: 'बारी-बारी से', save_repeat: 'सेव करें', next: 'अगला', complete_task: 'काम पूरा करें', photo_proof: 'फ़ोटो सबूत',
  location_captured: 'लोकेशन मिली', remarks: 'टिप्पणी', submit: 'जमा करें', office: 'ऑफिस', field: 'फ़ील्ड', wfh: 'घर से काम',
  inside_geofence: 'जियोफेंस के अंदर', take_selfie: 'सेल्फ़ी लें', my_attendance: 'मेरी हाज़िरी', present: 'हाज़िर', late: 'देर से', leave: 'छुट्टी',
  hours: 'घंटे', working: 'काम पर', apply_leave: 'छुट्टी के लिए आवेदन', casual: 'कैज़ुअल', sick: 'बीमारी', earned: 'अर्जित', comp_off: 'कॉम्प-ऑफ़',
  type: 'प्रकार', from_to: 'से – तक', reason: 'कारण', hand_over: 'काम किसे सौंपें', send_for_approval: 'मंज़ूरी के लिए भेजें', approvals: 'मंज़ूरियाँ',
  approve: 'मंज़ूर', reject: 'अस्वीकार', timesheet: 'टाइमशीट', total: 'कुल', billable: 'बिल योग्य', start_timer: 'टाइमर शुरू', stop_timer: 'टाइमर रोकें',
  calendar: 'कैलेंडर', synced_gcal: 'Google Calendar से जुड़ा', notifications: 'सूचनाएँ', goals: 'लक्ष्य', performance: 'प्रदर्शन', your_score: 'आपका स्कोर',
  leaderboard: 'लीडरबोर्ड', attendance: 'हाज़िरी', rating: 'रेटिंग', team_location: 'टीम लोकेशन', ai_suggestions: 'AI सुझाव', skip: 'छोड़ें', add: 'जोड़ें',
  language: 'भाषा', connected: 'जुड़ा हुआ', privacy: 'गोपनीयता और सुरक्षा', salary_docs: 'सैलरी स्लिप और दस्तावेज़', logout: 'लॉगआउट', message: 'संदेश…',
  share_location: 'काम के समय लोकेशन साझा करें', save: 'सेव', cancel: 'रद्द', retry: 'फिर कोशिश करें', nothing_here: 'अभी कुछ नहीं', all_caught_up: 'सब देख लिया',
  tomorrow: 'कल', more: 'और',
};

const mr: Dict = {
  welcome_back: 'पुन्हा स्वागत', login_mobile: 'मोबाइल नंबरने लॉगिन करा', company_code: 'कंपनी कोड', send_otp: 'OTP पाठवा', verify_login: 'पडताळा आणि लॉगिन',
  choose_language: 'तुमची भाषा निवडा', change_anytime: 'तुम्ही कधीही बदलू शकता', continue: 'पुढे', hi: 'नमस्कार', punch_in: 'पंच इन', punch_out: 'पंच आउट',
  today: 'आज', overdue: 'उशीर', upcoming: 'येणारे', on_time: 'वेळेवर', done: 'पूर्ण', todays_tasks: 'आजची कामे', see_all: 'सर्व पहा', home: 'होम', tasks: 'कामे',
  chat: 'चॅट', me: 'मी', mark_complete: 'पूर्ण करा', new_task: 'नवीन काम', assign_task: 'काम द्या', my_attendance: 'माझी हजेरी', apply_leave: 'रजेसाठी अर्ज',
  approvals: 'मंजुरी', approve: 'मंजूर', reject: 'नाकारा', logout: 'लॉगआउट', language: 'भाषा', tomorrow: 'उद्या', in_progress: 'सुरू आहे', not_started: 'सुरू नाही',
};
const gu: Dict = {
  welcome_back: 'ફરી સ્વાગત છે', login_mobile: 'મોબાઇલ નંબરથી લોગિન કરો', company_code: 'કંપની કોડ', send_otp: 'OTP મોકલો', verify_login: 'ચકાસો અને લોગિન',
  choose_language: 'તમારી ભાષા પસંદ કરો', change_anytime: 'તમે ગમે ત્યારે બદલી શકો', continue: 'આગળ', hi: 'નમસ્તે', punch_in: 'પંચ ઇન', punch_out: 'પંચ આઉટ',
  today: 'આજે', overdue: 'મોડું', upcoming: 'આગામી', on_time: 'સમયસર', done: 'પૂર્ણ', todays_tasks: 'આજના કામ', see_all: 'બધું જુઓ', home: 'હોમ', tasks: 'કામ',
  chat: 'ચેટ', me: 'હું', mark_complete: 'પૂર્ણ કરો', new_task: 'નવું કામ', assign_task: 'કામ સોંપો', my_attendance: 'મારી હાજરી', apply_leave: 'રજા માટે અરજી',
  approvals: 'મંજૂરીઓ', approve: 'મંજૂર', reject: 'નામંજૂર', logout: 'લોગઆઉટ', language: 'ભાષા', tomorrow: 'કાલે', in_progress: 'ચાલુ', not_started: 'શરૂ નથી',
};
const ta: Dict = {
  welcome_back: 'மீண்டும் வருக', login_mobile: 'மொபைல் எண் மூலம் உள்நுழைக', company_code: 'நிறுவனக் குறியீடு', send_otp: 'OTP அனுப்பு', verify_login: 'சரிபார்த்து உள்நுழை',
  choose_language: 'உங்கள் மொழியைத் தேர்ந்தெடுக்கவும்', change_anytime: 'எப்போது வேண்டுமானாலும் மாற்றலாம்', continue: 'தொடர்க', hi: 'வணக்கம்', punch_in: 'பஞ்ச் இன்',
  punch_out: 'பஞ்ச் அவுட்', today: 'இன்று', overdue: 'தாமதம்', upcoming: 'வரவிருக்கும்', on_time: 'சரியான நேரம்', done: 'முடிந்தது', todays_tasks: 'இன்றைய பணிகள்',
  see_all: 'அனைத்தும்', home: 'முகப்பு', tasks: 'பணிகள்', chat: 'அரட்டை', me: 'நான்', mark_complete: 'முடிந்தது என குறி', new_task: 'புதிய பணி', logout: 'வெளியேறு',
  language: 'மொழி', tomorrow: 'நாளை', apply_leave: 'விடுப்பு விண்ணப்பம்', my_attendance: 'என் வருகை',
};
const te: Dict = {
  welcome_back: 'మళ్ళీ స్వాగతం', login_mobile: 'మొబైల్ నంబర్‌తో లాగిన్ అవ్వండి', company_code: 'కంపెనీ కోడ్', send_otp: 'OTP పంపండి', verify_login: 'ధృవీకరించి లాగిన్',
  choose_language: 'మీ భాషను ఎంచుకోండి', change_anytime: 'ఎప్పుడైనా మార్చవచ్చు', continue: 'కొనసాగించు', hi: 'నమస్తే', punch_in: 'పంచ్ ఇన్', punch_out: 'పంచ్ అవుట్',
  today: 'ఈరోజు', overdue: 'ఆలస్యం', upcoming: 'రాబోయే', on_time: 'సమయానికి', done: 'పూర్తి', todays_tasks: 'ఈరోజు పనులు', see_all: 'అన్నీ', home: 'హోమ్',
  tasks: 'పనులు', chat: 'చాట్', me: 'నేను', mark_complete: 'పూర్తి చేయి', new_task: 'కొత్త పని', logout: 'లాగ్ అవుట్', language: 'భాష', tomorrow: 'రేపు',
  apply_leave: 'సెలవు దరఖాస్తు', my_attendance: 'నా హాజరు',
};
const bn: Dict = {
  welcome_back: 'আবার স্বাগতম', login_mobile: 'মোবাইল নম্বর দিয়ে লগইন করুন', company_code: 'কোম্পানি কোড', send_otp: 'OTP পাঠান', verify_login: 'যাচাই করে লগইন',
  choose_language: 'আপনার ভাষা বেছে নিন', change_anytime: 'যেকোনো সময় বদলাতে পারবেন', continue: 'এগিয়ে যান', hi: 'নমস্কার', punch_in: 'পাঞ্চ ইন', punch_out: 'পাঞ্চ আউট',
  today: 'আজ', overdue: 'দেরি', upcoming: 'আসন্ন', on_time: 'সময়মতো', done: 'সম্পন্ন', todays_tasks: 'আজকের কাজ', see_all: 'সব দেখুন', home: 'হোম', tasks: 'কাজ',
  chat: 'চ্যাট', me: 'আমি', mark_complete: 'সম্পন্ন করুন', new_task: 'নতুন কাজ', logout: 'লগআউট', language: 'ভাষা', tomorrow: 'আগামীকাল',
  apply_leave: 'ছুটির আবেদন', my_attendance: 'আমার হাজিরা',
};
const kn: Dict = {
  welcome_back: 'ಮರಳಿ ಸ್ವಾಗತ', login_mobile: 'ಮೊಬೈಲ್ ಸಂಖ್ಯೆಯಿಂದ ಲಾಗಿನ್ ಮಾಡಿ', company_code: 'ಕಂಪನಿ ಕೋಡ್', send_otp: 'OTP ಕಳುಹಿಸಿ', verify_login: 'ಪರಿಶೀಲಿಸಿ ಲಾಗಿನ್',
  choose_language: 'ನಿಮ್ಮ ಭಾಷೆ ಆಯ್ಕೆಮಾಡಿ', change_anytime: 'ಯಾವಾಗ ಬೇಕಾದರೂ ಬದಲಾಯಿಸಬಹುದು', continue: 'ಮುಂದುವರಿಸಿ', hi: 'ನಮಸ್ಕಾರ', punch_in: 'ಪಂಚ್ ಇನ್',
  punch_out: 'ಪಂಚ್ ಔಟ್', today: 'ಇಂದು', overdue: 'ತಡ', upcoming: 'ಮುಂಬರುವ', on_time: 'ಸಮಯಕ್ಕೆ', done: 'ಮುಗಿದಿದೆ', todays_tasks: 'ಇಂದಿನ ಕೆಲಸಗಳು', see_all: 'ಎಲ್ಲಾ',
  home: 'ಮುಖಪುಟ', tasks: 'ಕೆಲಸಗಳು', chat: 'ಚಾಟ್', me: 'ನಾನು', mark_complete: 'ಮುಗಿದಿದೆ', new_task: 'ಹೊಸ ಕೆಲಸ', logout: 'ಲಾಗ್ ಔಟ್', language: 'ಭಾಷೆ', tomorrow: 'ನಾಳೆ',
};
const ar: Dict = {
  welcome_back: 'مرحبًا بعودتك', login_mobile: 'سجّل الدخول برقم هاتفك', company_code: 'رمز الشركة', mobile: 'الجوال', send_otp: 'إرسال الرمز', verify_login: 'تحقق وسجّل الدخول',
  choose_language: 'اختر لغتك', change_anytime: 'يمكنك تغييرها في أي وقت', continue: 'متابعة', hi: 'مرحبًا', punch_in: 'تسجيل الحضور', punch_out: 'تسجيل الانصراف',
  today: 'اليوم', overdue: 'متأخر', upcoming: 'قادم', on_time: 'في الوقت', done: 'منجز', todays_tasks: 'مهام اليوم', see_all: 'عرض الكل', home: 'الرئيسية',
  tasks: 'المهام', task: 'مهمة', chat: 'الدردشة', me: 'أنا', mark_complete: 'تم الإنجاز', new_task: 'مهمة جديدة', assign_task: 'إسناد المهمة', my_attendance: 'حضوري',
  apply_leave: 'طلب إجازة', approvals: 'الموافقات', approve: 'موافقة', reject: 'رفض', logout: 'تسجيل الخروج', language: 'اللغة', tomorrow: 'غدًا',
  in_progress: 'قيد التنفيذ', not_started: 'لم تبدأ',
};

const dicts: Record<string, Dict> = { en, hi, mr, gu, ta, te, bn, kn, ar };
export type TKey = keyof typeof en;
export const translate = (lang: string, key: TKey | string) => (dicts[lang] as any)?.[key] ?? (en as any)[key] ?? key;
