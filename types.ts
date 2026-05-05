
export enum AppStep {
  WELCOME = 'WELCOME',
  UPLOAD = 'UPLOAD',
  CAMERA = 'CAMERA',
  PROCESSING = 'PROCESSING',
  RESULT = 'RESULT',
  HISTORY = 'HISTORY',
  LIBRARY = 'LIBRARY'
}

export type SupportedLanguage = 'en' | 'hi' | 'mr' | 'te' | 'ta' | 'bn' | 'gu' | 'kn' | 'pa';

/** Shape returned by POST /analyze on the FastAPI backend */
export interface BackendDiagnosis {
  diagnosis: string;           // e.g. "Tomato___Early_blight"
  plant: string;               // e.g. "Tomato"
  disease: string;             // e.g. "Early blight"
  confidence: number;          // 0–1
  is_healthy: boolean;
  description: string;
  prevention: string;
  top_predictions: { label: string; confidence: number }[];
}

/** App-level result stored in history */
export interface DiagnosisResult {
  id: string;
  timestamp: number;
  imageUrl: string;
  plant: string;
  disease: string;
  diagnosis: string;           // raw label
  confidence: number;
  is_healthy: boolean;
  description: string;
  prevention: string;
  top_predictions: { label: string; confidence: number }[];
}

export interface AppState {
  step: AppStep;
  selectedImage: string | null;
  selectedFile: File | null;
  diagnosis: DiagnosisResult | null;
  error: string | null;
  history: DiagnosisResult[];
  language: SupportedLanguage;
}

export const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

type DiseaseEntry = { d: (c: number) => string; p: string };
type DiseaseLang = Record<string, DiseaseEntry>;

const en_dc: DiseaseLang = {
  'Healthy Leaf': {
    d: c => `The Chilli leaf appears healthy with no visible signs of disease (confidence: ${(c*100).toFixed(1)}%).`,
    p: 'Ensure proper plant spacing for air circulation, avoid overhead watering, apply balanced fertilizers, and inspect regularly for early signs of pests or disease.'
  },
  'Bacterial Spot': {
    d: c => `Bacterial Spot detected on Chilli leaf with ${(c*100).toFixed(1)}% confidence. Dark water-soaked lesions are visible on the leaf surface.`,
    p: 'Remove and destroy infected plant material. Apply copper-based bactericide. Avoid overhead irrigation. Maintain proper plant spacing for airflow. Use disease-free seeds.'
  },
  'Cercospora Leaf Spot': {
    d: c => `Cercospora Leaf Spot detected with ${(c*100).toFixed(1)}% confidence. Circular brown spots with grey centers are present on the leaf.`,
    p: 'Remove infected leaves immediately. Apply mancozeb or copper-based fungicide. Avoid excess moisture on leaves. Practice crop rotation and maintain field hygiene.'
  },
  'Curl Virus': {
    d: c => `Curl Virus detected with ${(c*100).toFixed(1)}% confidence. Viral infection is causing leaf curling and stunted growth.`,
    p: 'Control whitefly vectors using neem oil or insecticide. Remove and destroy all infected plants immediately. Use virus-resistant varieties. Avoid planting near infected crops.'
  },
  'Nutrition Deficiency': {
    d: c => `Nutrition Deficiency detected with ${(c*100).toFixed(1)}% confidence. The plant shows signs of inadequate nutrient supply affecting leaf color and growth.`,
    p: 'Conduct soil testing to identify deficiencies. Apply balanced NPK fertilizer. Correct soil pH if needed. Supplement with micronutrients (zinc, iron, magnesium) as required.'
  },
  'White Spot': {
    d: c => `White Spot detected with ${(c*100).toFixed(1)}% confidence. White powdery or circular spots are visible on the leaf surface.`,
    p: 'Apply sulfur-based or systemic fungicide. Remove and destroy affected leaves. Ensure good air circulation around plants. Avoid excessive humidity.'
  },
};

const hi_dc: DiseaseLang = {
  'Healthy Leaf': {
    d: c => `मिर्च की पत्ती स्वस्थ है, रोग के कोई संकेत नहीं (विश्वास: ${(c*100).toFixed(1)}%)।`,
    p: 'उचित दूरी बनाए रखें, ऊपर से सिंचाई से बचें, संतुलित उर्वरक डालें और नियमित रूप से कीट व रोग के शुरुआती संकेतों की जांच करें।'
  },
  'Bacterial Spot': {
    d: c => `मिर्च की पत्ती पर ${(c*100).toFixed(1)}% विश्वास के साथ बैक्टीरियल स्पॉट पाया गया। पत्ती पर गहरे, पानी-भीगे धब्बे दिखाई दे रहे हैं।`,
    p: 'संक्रमित पौध सामग्री हटाएं व नष्ट करें। तांबे आधारित जीवाणुनाशक लगाएं। ऊपर से सिंचाई से बचें। पौधों के बीच उचित दूरी रखें।'
  },
  'Cercospora Leaf Spot': {
    d: c => `${(c*100).toFixed(1)}% विश्वास के साथ सर्कोस्पोरा लीफ स्पॉट पाया गया। पत्ती पर धूसर केंद्र वाले भूरे गोल धब्बे हैं।`,
    p: 'संक्रमित पत्तियां तुरंत हटाएं। मैन्कोज़ेब या तांबे का फफूंदनाशक लगाएं। पत्तियों पर अत्यधिक नमी से बचें। फसल चक्रण अपनाएं।'
  },
  'Curl Virus': {
    d: c => `${(c*100).toFixed(1)}% विश्वास के साथ कर्ल वायरस पाया गया। वायरल संक्रमण से पत्तियां मुड़ रही हैं और वृद्धि रुकी है।`,
    p: 'नीम तेल या कीटनाशक से सफेद मक्खी नियंत्रित करें। संक्रमित पौधे तुरंत हटाएं। वायरस-प्रतिरोधी किस्में उगाएं।'
  },
  'Nutrition Deficiency': {
    d: c => `${(c*100).toFixed(1)}% विश्वास के साथ पोषण की कमी पाई गई। पौधा अपर्याप्त पोषक तत्वों के संकेत दिखा रहा है।`,
    p: 'मिट्टी परीक्षण करें। संतुलित NPK उर्वरक डालें। आवश्यकतानुसार जस्ता, लोहा, मैग्नीशियम जैसे सूक्ष्म पोषक तत्व दें।'
  },
  'White Spot': {
    d: c => `${(c*100).toFixed(1)}% विश्वास के साथ व्हाइट स्पॉट पाया गया। पत्ती की सतह पर सफेद पाउडरी धब्बे दिखाई दे रहे हैं।`,
    p: 'सल्फर आधारित फफूंदनाशक लगाएं। प्रभावित पत्तियां हटाएं। पौधों के आसपास वायु परिसंचरण सुनिश्चित करें। अत्यधिक नमी से बचें।'
  },
};

const mr_dc: DiseaseLang = {
  'Healthy Leaf': {
    d: c => `मिरचीचे पान निरोगी आहे, रोगाची कोणतीही चिन्हे नाहीत (विश्वासार्हता: ${(c*100).toFixed(1)}%).`,
    p: 'योग्य अंतर ठेवा, वरून पाणी देणे टाळा, संतुलित खते वापरा आणि नियमितपणे कीड-रोगाच्या प्रारंभिक लक्षणांची तपासणी करा.'
  },
  'Bacterial Spot': {
    d: c => `मिरचीच्या पानावर ${(c*100).toFixed(1)}% विश्वासार्हतेने जिवाणू डाग (Bacterial Spot) आढळला. पानावर गडद, ओले डाग दिसत आहेत.`,
    p: 'संक्रमित वनस्पती साहित्य काढा व नष्ट करा. तांबे-आधारित जीवाणूनाशक फवारा. वरून पाणी देणे टाळा. झाडांमध्ये योग्य अंतर ठेवा.'
  },
  'Cercospora Leaf Spot': {
    d: c => `${(c*100).toFixed(1)}% विश्वासार्हतेने सर्कोस्पोरा पानावरील डाग आढळला. राखाडी केंद्र असलेले गोल तपकिरी डाग आहेत.`,
    p: 'संक्रमित पाने त्वरित काढा. मॅन्कोझेब किंवा तांबे-आधारित बुरशीनाशक वापरा. ओलावा टाळा. पीक फेरबदल करा.'
  },
  'Curl Virus': {
    d: c => `${(c*100).toFixed(1)}% विश्वासार्हतेने कर्ल विषाणू आढळला. विषाणूमुळे पाने वाकली आहेत आणि वाढ थांबली आहे.`,
    p: 'कडुनिंब तेल किंवा कीटकनाशकाने पांढरी माशी नियंत्रित करा. संक्रमित झाडे त्वरित काढा. विषाणू-प्रतिरोधक वाण वापरा.'
  },
  'Nutrition Deficiency': {
    d: c => `${(c*100).toFixed(1)}% विश्वासार्हतेने पोषण कमतरता आढळली. झाड अपुऱ्या पोषक तत्वांची चिन्हे दाखवत आहे.`,
    p: 'माती परीक्षण करा. संतुलित NPK खत वापरा. आवश्यकतेनुसार जस्त, लोह, मॅग्नेशियम सूक्ष्म पोषक तत्वे द्या.'
  },
  'White Spot': {
    d: c => `${(c*100).toFixed(1)}% विश्वासार्हतेने पांढरे डाग (White Spot) आढळले. पानाच्या पृष्ठभागावर पांढरे पावडरसारखे डाग दिसत आहेत.`,
    p: 'सल्फर-आधारित बुरशीनाशक वापरा. प्रभावित पाने काढा. झाडांभोवती हवा परिसंचरण सुनिश्चित करा. जास्त आर्द्रता टाळा.'
  },
};

const te_dc: DiseaseLang = {
  'Healthy Leaf': { d: c => `మిరప ఆకు ఆరోగ్యంగా ఉంది, వ్యాధి సంకేతాలు లేవు (విశ్వసనీయత: ${(c*100).toFixed(1)}%).`, p: 'సరైన మొక్కల మధ్య దూరం ఉంచండి, పైనుండి నీరు పోయడం మానండి, సమతుల్య ఎరువులు వేయండి, తెగుళ్ళ కోసం క్రమం తప్పకుండా తనిఖీ చేయండి.' },
  'Bacterial Spot': { d: c => `మిరప ఆకుపై ${(c*100).toFixed(1)}% విశ్వసనీయతతో బ్యాక్టీరియల్ స్పాట్ కనుగొనబడింది.`, p: 'సోకిన మొక్క భాగాలను తొలగించి నాశనం చేయండి. రాగి ఆధారిత బ్యాక్టీరిసైడ్ పిచికారీ చేయండి.' },
  'Cercospora Leaf Spot': { d: c => `${(c*100).toFixed(1)}% విశ్వసనీయతతో సెర్కోస్పోరా ఆకు మచ్చ కనుగొనబడింది.`, p: 'సోకిన ఆకులను వెంటనే తొలగించండి. మాంకోజెబ్ లేదా రాగి ఆధారిత శిలీంద్రనాశిని వాడండి.' },
  'Curl Virus': { d: c => `${(c*100).toFixed(1)}% విశ్వసనీయతతో కర్ల్ వైరస్ కనుగొనబడింది. వైరస్ వల్ల ఆకులు ముడుచుకుపోతున్నాయి.`, p: 'వేపనూనె లేదా పురుగుమందుతో తెల్లదోమలను నియంత్రించండి. సోకిన మొక్కలను తొలగించండి.' },
  'Nutrition Deficiency': { d: c => `${(c*100).toFixed(1)}% విశ్వసనీయతతో పోషక లోపం కనుగొనబడింది.`, p: 'మట్టి పరీక్ష చేయించండి. సమతుల్య NPK ఎరువు వేయండి. అవసరమైతే సూక్ష్మపోషకాలు అందించండి.' },
  'White Spot': { d: c => `${(c*100).toFixed(1)}% విశ్వసనీయతతో తెల్ల మచ్చ కనుగొనబడింది.`, p: 'సల్ఫర్ ఆధారిత శిలీంద్రనాశిని వాడండి. ప్రభావిత ఆకులను తొలగించండి. అధిక తేమను నివారించండి.' },
};

const ta_dc: DiseaseLang = {
  'Healthy Leaf': { d: c => `மிளகாய் இலை ஆரோக்கியமாக உள்ளது, நோய் அறிகுறிகள் இல்லை (நம்பிக்கை: ${(c*100).toFixed(1)}%).`, p: 'காற்று சுழற்சிக்கு சரியான இடைவெளி வைக்கவும், மேலிருந்து நீர் ஊற்றுவதை தவிர்க்கவும், சமச்சீர் உரங்களை இடவும்.' },
  'Bacterial Spot': { d: c => `மிளகாய் இலையில் ${(c*100).toFixed(1)}% நம்பிக்கையுடன் பாக்டீரியல் புள்ளி கண்டறியப்பட்டது.`, p: 'பாதிக்கப்பட்ட தாவர பகுதிகளை அகற்றி அழிக்கவும். செம்பு அடிப்படையிலான பூச்சிக்கொல்லி தெளிக்கவும்.' },
  'Cercospora Leaf Spot': { d: c => `${(c*100).toFixed(1)}% நம்பிக்கையுடன் செர்கோஸ்போரா இலைப்புள்ளி கண்டறியப்பட்டது.`, p: 'பாதிக்கப்பட்ட இலைகளை உடனடியாக அகற்றவும். மான்கோசெப் பூஞ்சைக்கொல்லி பயன்படுத்தவும்.' },
  'Curl Virus': { d: c => `${(c*100).toFixed(1)}% நம்பிக்கையுடன் சுருள் வைரஸ் கண்டறியப்பட்டது. இலைகள் சுருண்டு வளர்ச்சி குன்றியுள்ளது.`, p: 'வேப்ப எண்ணெய் மூலம் வெள்ளை ஈக்களை கட்டுப்படுத்தவும். பாதிக்கப்பட்ட செடிகளை அகற்றவும்.' },
  'Nutrition Deficiency': { d: c => `${(c*100).toFixed(1)}% நம்பிக்கையுடன் ஊட்டச்சத்து குறைபாடு கண்டறியப்பட்டது.`, p: 'மண் பரிசோதனை செய்யவும். சமச்சீர் NPK உரம் இடவும். நுண்ணூட்டச்சத்துக்கள் தேவைப்பட்டால் வழங்கவும்.' },
  'White Spot': { d: c => `${(c*100).toFixed(1)}% நம்பிக்கையுடன் வெள்ளைப்புள்ளி கண்டறியப்பட்டது.`, p: 'கந்தக அடிப்படையிலான பூஞ்சைக்கொல்லி பயன்படுத்தவும். பாதிக்கப்பட்ட இலைகளை அகற்றவும்.' },
};

const bn_dc: DiseaseLang = {
  'Healthy Leaf': { d: c => `মরিচের পাতা সুস্থ, রোগের কোনো লক্ষণ নেই (আত্মবিশ্বাস: ${(c*100).toFixed(1)}%)।`, p: 'সঠিক দূরত্ব বজায় রাখুন, উপর থেকে সেচ এড়িয়ে চলুন, সুষম সার দিন এবং নিয়মিত পোকা ও রোগের প্রাথমিক লক্ষণ পরীক্ষা করুন।' },
  'Bacterial Spot': { d: c => `মরিচের পাতায় ${(c*100).toFixed(1)}% আত্মবিশ্বাসে ব্যাকটেরিয়াল স্পট পাওয়া গেছে।`, p: 'সংক্রমিত অংশ সরিয়ে ধ্বংস করুন। তামা-ভিত্তিক ব্যাকটেরিসাইড প্রয়োগ করুন।' },
  'Cercospora Leaf Spot': { d: c => `${(c*100).toFixed(1)}% আত্মবিশ্বাসে সার্কোস্পোরা পাতার দাগ পাওয়া গেছে।`, p: 'সংক্রমিত পাতা সরিয়ে ফেলুন। ম্যানকোজেব ছত্রাকনাশক ব্যবহার করুন।' },
  'Curl Virus': { d: c => `${(c*100).toFixed(1)}% আত্মবিশ্বাসে কার্ল ভাইরাস পাওয়া গেছে। পাতা কুঁকড়ে যাচ্ছে এবং বৃদ্ধি থমকে গেছে।`, p: 'নিম তেল দিয়ে সাদা মাছি নিয়ন্ত্রণ করুন। সংক্রমিত গাছ সরিয়ে ফেলুন।' },
  'Nutrition Deficiency': { d: c => `${(c*100).toFixed(1)}% আত্মবিশ্বাসে পুষ্টির ঘাটতি পাওয়া গেছে।`, p: 'মাটি পরীক্ষা করান। সুষম NPK সার দিন। প্রয়োজনে অণুপুষ্টি সরবরাহ করুন।' },
  'White Spot': { d: c => `${(c*100).toFixed(1)}% আত্মবিশ্বাসে সাদা দাগ পাওয়া গেছে।`, p: 'সালফার-ভিত্তিক ছত্রাকনাশক ব্যবহার করুন। আক্রান্ত পাতা সরিয়ে ফেলুন।' },
};

const gu_dc: DiseaseLang = {
  'Healthy Leaf': { d: c => `મરચાંનું પાન સ્વસ્થ છે, રોગના કોઈ ચિહ્નો નથી (વિશ્વાસ: ${(c*100).toFixed(1)}%).`, p: 'યોગ્ય અંતર રાખો, ઉપરથી પાણી આપવાનું ટાળો, સંતુલિત ખાતર વાપરો અને નિયમિત તપાસ કરો.' },
  'Bacterial Spot': { d: c => `મરચાંના પાન પર ${(c*100).toFixed(1)}% વિશ્વાસ સાથે બેક્ટેરિયલ સ્પોટ મળ્યો.`, p: 'ચેપગ્રસ્ત ભાગ દૂર કરો. તાંબા આધારિત બેક્ટેરિસાઈડ છાંટો.' },
  'Cercospora Leaf Spot': { d: c => `${(c*100).toFixed(1)}% વિશ્વાસ સાથે સર્કોસ્પોરા પાનના ડાઘ મળ્યા.`, p: 'ચેપગ્રસ્ત પાન તરત દૂર કરો. મેન્કોઝેબ ફૂગનાશક વાપરો.' },
  'Curl Virus': { d: c => `${(c*100).toFixed(1)}% વિશ્વાસ સાથે કર્લ વાયરસ મળ્યો. પાન વળી ગયા છે અને વૃદ્ધિ અટકી છે.`, p: 'લીમડાના તેલથી સફેદ માખી નિયંત્રિત કરો. ચેપગ્રસ્ત છોડ દૂર કરો.' },
  'Nutrition Deficiency': { d: c => `${(c*100).toFixed(1)}% વિશ્વાસ સાથે પોષણની ખામી મળી.`, p: 'માટી પરીક્ષણ કરો. સંતુલિત NPK ખાતર વાપરો. જરૂર મુજબ સૂક્ષ્મ પોષક તત્વો આપો.' },
  'White Spot': { d: c => `${(c*100).toFixed(1)}% વિશ્વાસ સાથે સફેદ ડાઘ મળ્યા.`, p: 'સલ્ફર આધારિત ફૂગનાશક વાપરો. અસરગ્રસ્ત પાન દૂર કરો.' },
};

const kn_dc: DiseaseLang = {
  'Healthy Leaf': { d: c => `ಮೆಣಸಿನ ಎಲೆ ಆರೋಗ್ಯಕರವಾಗಿದೆ, ರೋಗದ ಯಾವುದೇ ಲಕ್ಷಣಗಳಿಲ್ಲ (ನಂಬಿಕೆ: ${(c*100).toFixed(1)}%).`, p: 'ಸರಿಯಾದ ಅಂತರ ಕಾಯ್ದುಕೊಳ್ಳಿ, ಮೇಲಿನಿಂದ ನೀರು ಹಾಕುವುದನ್ನು ತಪ್ಪಿಸಿ, ಸಮತೋಲಿತ ಗೊಬ್ಬರ ಬಳಸಿ.' },
  'Bacterial Spot': { d: c => `ಮೆಣಸಿನ ಎಲೆಯ ಮೇಲೆ ${(c*100).toFixed(1)}% ನಂಬಿಕೆಯೊಂದಿಗೆ ಬ್ಯಾಕ್ಟೀರಿಯಲ್ ಸ್ಪಾಟ್ ಪತ್ತೆಯಾಗಿದೆ.`, p: 'ಸೋಂಕಿತ ಭಾಗಗಳನ್ನು ತೆಗೆದು ನಾಶಮಾಡಿ. ತಾಮ್ರ ಆಧಾರಿತ ಬ್ಯಾಕ್ಟೀರಿಸೈಡ್ ಸಿಂಪಡಿಸಿ.' },
  'Cercospora Leaf Spot': { d: c => `${(c*100).toFixed(1)}% ನಂಬಿಕೆಯೊಂದಿಗೆ ಸರ್ಕೋಸ್ಪೋರಾ ಎಲೆ ಕಲೆ ಪತ್ತೆಯಾಗಿದೆ.`, p: 'ಸೋಂಕಿತ ಎಲೆಗಳನ್ನು ತಕ್ಷಣ ತೆಗೆಯಿರಿ. ಮ್ಯಾಂಕೋಜೆಬ್ ಶಿಲೀಂಧ್ರನಾಶಕ ಬಳಸಿ.' },
  'Curl Virus': { d: c => `${(c*100).toFixed(1)}% ನಂಬಿಕೆಯೊಂದಿಗೆ ಕರ್ಲ್ ವೈರಸ್ ಪತ್ತೆಯಾಗಿದೆ. ಎಲೆಗಳು ಮುದುರಿವೆ ಮತ್ತು ಬೆಳವಣಿಗೆ ನಿಂತಿದೆ.`, p: 'ಬೇವಿನ ಎಣ್ಣೆಯಿಂದ ಬಿಳಿ ನೊಣಗಳನ್ನು ನಿಯಂತ್ರಿಸಿ. ಸೋಂಕಿತ ಗಿಡಗಳನ್ನು ತೆಗೆಯಿರಿ.' },
  'Nutrition Deficiency': { d: c => `${(c*100).toFixed(1)}% ನಂಬಿಕೆಯೊಂದಿಗೆ ಪೋಷಕಾಂಶ ಕೊರತೆ ಪತ್ತೆಯಾಗಿದೆ.`, p: 'ಮಣ್ಣು ಪರೀಕ್ಷೆ ಮಾಡಿಸಿ. ಸಮತೋಲಿತ NPK ಗೊಬ್ಬರ ಬಳಸಿ.' },
  'White Spot': { d: c => `${(c*100).toFixed(1)}% ನಂಬಿಕೆಯೊಂದಿಗೆ ಬಿಳಿ ಕಲೆ ಪತ್ತೆಯಾಗಿದೆ.`, p: 'ಗಂಧಕ ಆಧಾರಿತ ಶಿಲೀಂಧ್ರನಾಶಕ ಬಳಸಿ. ಪ್ರಭಾವಿತ ಎಲೆಗಳನ್ನು ತೆಗೆಯಿರಿ.' },
};

const pa_dc: DiseaseLang = {
  'Healthy Leaf': { d: c => `ਮਿਰਚ ਦਾ ਪੱਤਾ ਸਿਹਤਮੰਦ ਹੈ, ਬਿਮਾਰੀ ਦੇ ਕੋਈ ਲੱਛਣ ਨਹੀਂ (ਭਰੋਸਾ: ${(c*100).toFixed(1)}%)।`, p: 'ਸਹੀ ਦੂਰੀ ਰੱਖੋ, ਉੱਪਰੋਂ ਪਾਣੀ ਦੇਣ ਤੋਂ ਬਚੋ, ਸੰਤੁਲਿਤ ਖਾਦ ਪਾਓ ਅਤੇ ਨਿਯਮਿਤ ਜਾਂਚ ਕਰੋ।' },
  'Bacterial Spot': { d: c => `ਮਿਰਚ ਦੇ ਪੱਤੇ 'ਤੇ ${(c*100).toFixed(1)}% ਭਰੋਸੇ ਨਾਲ ਬੈਕਟੀਰੀਅਲ ਸਪਾਟ ਮਿਲਿਆ।`, p: 'ਲਾਗ ਵਾਲੇ ਹਿੱਸੇ ਹਟਾ ਕੇ ਨਸ਼ਟ ਕਰੋ। ਤਾਂਬਾ ਅਧਾਰਿਤ ਬੈਕਟੀਰੀਸਾਈਡ ਛਿੜਕੋ।' },
  'Cercospora Leaf Spot': { d: c => `${(c*100).toFixed(1)}% ਭਰੋਸੇ ਨਾਲ ਸਰਕੋਸਪੋਰਾ ਪੱਤੇ ਦਾ ਧੱਬਾ ਮਿਲਿਆ।`, p: 'ਲਾਗ ਵਾਲੇ ਪੱਤੇ ਤੁਰੰਤ ਹਟਾਓ। ਮੈਨਕੋਜ਼ੈਬ ਉੱਲੀਨਾਸ਼ਕ ਵਰਤੋ।' },
  'Curl Virus': { d: c => `${(c*100).toFixed(1)}% ਭਰੋਸੇ ਨਾਲ ਕਰਲ ਵਾਇਰਸ ਮਿਲਿਆ। ਪੱਤੇ ਮੁੜ ਰਹੇ ਹਨ ਅਤੇ ਵਾਧਾ ਰੁਕ ਗਿਆ ਹੈ।`, p: 'ਨਿੰਮ ਤੇਲ ਨਾਲ ਚਿੱਟੀ ਮੱਖੀ ਕੰਟਰੋਲ ਕਰੋ। ਲਾਗ ਵਾਲੇ ਬੂਟੇ ਹਟਾਓ।' },
  'Nutrition Deficiency': { d: c => `${(c*100).toFixed(1)}% ਭਰੋਸੇ ਨਾਲ ਪੋਸ਼ਣ ਦੀ ਕਮੀ ਮਿਲੀ।`, p: 'ਮਿੱਟੀ ਦੀ ਜਾਂਚ ਕਰਾਓ। ਸੰਤੁਲਿਤ NPK ਖਾਦ ਪਾਓ।' },
  'White Spot': { d: c => `${(c*100).toFixed(1)}% ਭਰੋਸੇ ਨਾਲ ਚਿੱਟੇ ਧੱਬੇ ਮਿਲੇ।`, p: 'ਗੰਧਕ ਅਧਾਰਿਤ ਉੱਲੀਨਾਸ਼ਕ ਵਰਤੋ। ਪ੍ਰਭਾਵਿਤ ਪੱਤੇ ਹਟਾਓ।' },
};

export const DISEASE_CONTENT: Partial<Record<SupportedLanguage, DiseaseLang>> = {
  en: en_dc, hi: hi_dc, mr: mr_dc, te: te_dc, ta: ta_dc, bn: bn_dc, gu: gu_dc, kn: kn_dc, pa: pa_dc,
};

export function getLocalizedDisease(disease: string, is_healthy: boolean, confidence: number, lang: SupportedLanguage) {
  const key = is_healthy ? 'Healthy Leaf' : disease;
  const map = DISEASE_CONTENT[lang] ?? DISEASE_CONTENT['en']!;
  const entry = map[key] ?? DISEASE_CONTENT['en']![key];
  if (!entry) return null;
  return { description: entry.d(confidence), prevention: entry.p };
}

type PracticeEntry = { title: string; content: string; icon: string };
export const BEST_PRACTICES: Partial<Record<SupportedLanguage, PracticeEntry[]>> = {
  en: [
    { title: "General Best Practices", content: "Ensure proper spacing between plants for good air circulation. Rotate crops yearly to prevent soil-borne diseases. Regularly test soil to maintain ideal pH and nutrient levels.", icon: "eco" },
    { title: "Pesticide & Fertilizer Guide", content: "Always use protective gear when applying chemicals. Apply fertilizers based on soil test results, and avoid overuse which can burn roots.", icon: "science" },
    { title: "Weather Protection", content: "Improve field drainage to prevent waterlogging during heavy rains. Use mulching to retain soil moisture during extreme heat.", icon: "cloud" }
  ],
  hi: [
    { title: "सामान्य सर्वोत्तम अभ्यास", content: "हवा के अच्छे संचार के लिए पौधों के बीच उचित दूरी सुनिश्चित करें। मिट्टी जनित बीमारियों को रोकने के लिए प्रतिवर्ष फसल चक्र अपनाएं। आदर्श पीएच और पोषक तत्वों को बनाए रखने के लिए नियमित रूप से मिट्टी परीक्षण करें।", icon: "eco" },
    { title: "कीटनाशक और उर्वरक गाइड", content: "रसायनों का प्रयोग करते समय हमेशा सुरक्षात्मक गियर पहनें। मिट्टी परीक्षण के आधार पर उर्वरकों का प्रयोग करें, और अधिक उपयोग से बचें।", icon: "science" },
    { title: "मौसम से सुरक्षा", content: "भारी बारिश के दौरान जलभराव को रोकने के लिए खेत की जल निकासी में सुधार करें। अत्यधिक गर्मी के दौरान मिट्टी की नमी बनाए रखने के लिए मल्चिंग का उपयोग करें।", icon: "cloud" }
  ],
  mr: [
    { title: "सामान्य सर्वोत्तम पद्धती", content: "हवेच्या चांगल्या खेळत्या प्रमाणासाठी झाडांमध्ये योग्य अंतर ठेवा. मातीतील रोग टाळण्यासाठी दरवर्षी पीक फेरपालट करा. योग्य सामू (pH) आणि पोषक तत्वे राखण्यासाठी मातीचे नियमित परीक्षण करा.", icon: "eco" },
    { title: "कीटकनाशक आणि खते मार्गदर्शक", content: "रसायने फवारताना नेहमी संरक्षक साधने वापरा. माती परीक्षणानुसार खतांचा वापर करा आणि अतिवापर टाळा.", icon: "science" },
    { title: "हवामान संरक्षण", content: "मुसळधार पावसात पाणी साचू नये म्हणून शेतातील पाण्याचा निचरा सुधारा. अति उष्णतेच्या काळात मातीतील ओलावा टिकवून ठेवण्यासाठी आच्छादनाचा (मल्चिंग) वापर करा.", icon: "cloud" }
  ]
};

export function getBestPractices(lang: SupportedLanguage) {
  return BEST_PRACTICES[lang] || BEST_PRACTICES['en']!;
}

export const UI_TRANSLATIONS: Record<SupportedLanguage, any> = {
  en: {
    welcomeTitle: "Crop Disease",
    welcomeTitleAccent: "Prediction AI",
    welcomeSub: "Scan plant leaves for instant diagnosis and treatment plans.",
    getStarted: "GET STARTED",
    howItWorks: "HOW IT WORKS",
    navHome: "Home",
    navScan: "Scan",
    navHistory: "History",
    navLibrary: "Library",
    captureTip: "Capture or upload a high-quality photo of the plant leaf for accurate analysis.",
    camera: "Camera",
    gallery: "Gallery",
    awaitingInput: "Awaiting Input",
    analyzeBtn: "Analyze Crop",
    processingTitle: "Analysing Leaf…",
    processingSub: "CNN model is scanning cellular structures and identifying disease vectors…",
    diagnosisResult: "Diagnosis Result",
    confidence: "Confidence",
    healthy: "Healthy",
    diseased: "Disease Detected",
    observation: "Observation",
    prevention: "Prevention & Treatment",
    topPredictions: "Top Predictions",
    expertDisclaimer: "* Consult your local agricultural expert before applying chemical treatments.",
    historyTitle: "Scan History",
    noHistory: "No scans yet. Start by scanning a leaf!",
    language: "Language",
    back: "Back",
    scanAgain: "Scan Another",
    saveResult: "Saved to History"
  },
  hi: {
    welcomeTitle: "फसल रोग",
    welcomeTitleAccent: "पूर्वानुमान AI",
    welcomeSub: "तत्काल निदान और उपचार योजनाओं के लिए पौधों की पत्तियों को स्कैन करें।",
    getStarted: "शुरू करें",
    howItWorks: "यह कैसे काम करता है",
    navHome: "होम",
    navScan: "स्कैन",
    navHistory: "इतिहास",
    navLibrary: "लाइब्रेरी",
    captureTip: "सटीक विश्लेषण के लिए पौधे की पत्ती की उच्च गुणवत्ता वाली फोटो लें या अपलोड करें।",
    camera: "कैमरा",
    gallery: "गैलरी",
    awaitingInput: "इनपुट की प्रतीक्षा है",
    analyzeBtn: "फसल का विश्लेषण करें",
    processingTitle: "पत्ती का विश्लेषण हो रहा है…",
    processingSub: "CNN मॉडल सेलुलर संरचनाओं को स्कैन कर रहा है…",
    diagnosisResult: "निदान परिणाम",
    confidence: "विश्वास",
    healthy: "स्वस्थ",
    diseased: "रोग का पता चला",
    observation: "अवलोकन",
    prevention: "रोकथाम और उपचार",
    topPredictions: "शीर्ष भविष्यवाणियाँ",
    expertDisclaimer: "* रासायनिक उपचार लागू करने से पहले अपने स्थानीय कृषि विशेषज्ञ से परामर्श करें।",
    historyTitle: "स्कैन इतिहास",
    noHistory: "अभी तक कोई स्कैन नहीं। एक पत्ती स्कैन करके शुरू करें!",
    language: "भाषा",
    back: "पीछे",
    scanAgain: "दूसरा स्कैन करें",
    saveResult: "इतिहास में सहेजा"
  },
  mr: {
    welcomeTitle: "पिकांचे रोग",
    welcomeTitleAccent: "अंदाज AI",
    welcomeSub: "झटपट निदान आणि उपचार योजनांसाठी झाडाची पाने स्कॅन करा.",
    getStarted: "सुरू करा",
    howItWorks: "हे कसे कार्य करते",
    navHome: "होम", navScan: "स्कॅन", navHistory: "इतिहास", navLibrary: "लायब्ररी",
    captureTip: "अचूक विश्लेषणासाठी झाडाच्या पानाचा उच्च-गुणवत्तेचा फोटो काढा किंवा अपलोड करा.",
    camera: "कॅमेरा", gallery: "गॅलरी", awaitingInput: "इनपुटची प्रतीक्षा आहे",
    analyzeBtn: "पिकाचे विश्लेषण करा", processingTitle: "पान तपासत आहे…",
    processingSub: "CNN मॉडेल स्कॅन करत आहे…",
    diagnosisResult: "निदान निकाल", confidence: "विश्वासार्हता",
    healthy: "निरोगी", diseased: "रोग आढळला",
    observation: "निरीक्षण", prevention: "प्रतिबंध आणि उपचार",
    topPredictions: "शीर्ष अंदाज",
    expertDisclaimer: "* रासायनिक उपचार करण्यापूर्वी तुमच्या स्थानिक कृषी तज्ञाचा सल्ला घ्या.",
    historyTitle: "स्कॅन इतिहास", noHistory: "अद्याप कोणतेही स्कॅन नाहीत.",
    language: "भाषा", back: "मागे", scanAgain: "आणखी स्कॅन करा", saveResult: "जतन केले"
  },
  te: {
    welcomeTitle: "పంట వ్యాధుల",
    welcomeTitleAccent: "నిర్ధారణ AI",
    welcomeSub: "తక్షణ రోగ నిర్ధారణ కోసం మొక్కల ఆకులను స్కాన్ చేయండి.",
    getStarted: "ప్రారంభించండి", howItWorks: "ఇది ఎలా పని చేస్తుంది",
    navHome: "హోమ్", navScan: "స్కాన్", navHistory: "చరిత్ర", navLibrary: "లైబ్రరీ",
    captureTip: "ఖచ్చితమైన విశ్లేషణ కోసం మొక్క ఆకు యొక్క ఫోటోను అప్‌లోడ్ చేయండి.",
    camera: "కెమెరా", gallery: "గ్యాలరీ", awaitingInput: "ఇన్పుట్ కోసం వేచి ఉంది",
    analyzeBtn: "పంటను విశ్లేషించండి", processingTitle: "ఆకును విశ్లేషిస్తోంది…",
    processingSub: "CNN మోడల్ స్కాన్ చేస్తోంది…",
    diagnosisResult: "రోగ నిర్ధారణ ఫలితం", confidence: "విశ్వసనీయత",
    healthy: "ఆరోగ్యకరమైన", diseased: "వ్యాధి గుర్తించబడింది",
    observation: "పరిశీలన", prevention: "నివారణ & చికిత్స",
    topPredictions: "టాప్ అంచనాలు",
    expertDisclaimer: "* రసాయన చికిత్సలను వర్తించే ముందు నిపుణుడిని సంప్రదించండి.",
    historyTitle: "స్కాన్ చరిత్ర", noHistory: "ఇంకా స్కాన్‌లు లేవు.",
    language: "భాష", back: "వెనుకకు", scanAgain: "మళ్ళీ స్కాన్", saveResult: "సేవ్ చేయబడింది"
  },
  ta: {
    welcomeTitle: "பயிர் நோய்",
    welcomeTitleAccent: "கணிப்பு AI",
    welcomeSub: "உடனடி நோய் கண்டறிதலுக்கு செடியின் இலைகளை ஸ்கேன் செய்யவும்.",
    getStarted: "தொடங்குங்கள்", howItWorks: "இது எப்படி வேலை செய்கிறது",
    navHome: "முகப்பு", navScan: "ஸ்கேன்", navHistory: "வரலாறு", navLibrary: "நூலகம்",
    captureTip: "துல்லியமான பகுப்பாய்விற்கு தாவர இலையின் புகைப்படத்தை பதிவேற்றவும்.",
    camera: "கேமரா", gallery: "கேலரி", awaitingInput: "உள்ளீட்டிற்காக காத்திருக்கிறது",
    analyzeBtn: "பயிரைப் பகுப்பாய்வு செய்", processingTitle: "இலையை பகுப்பாய்வு செய்கிறது…",
    processingSub: "CNN மாதிரி ஸ்கேன் செய்கிறது…",
    diagnosisResult: "நோய் கண்டறிதல் முடிவு", confidence: "நம்பிக்கை",
    healthy: "ஆரோக்கியமான", diseased: "நோய் கண்டறியப்பட்டது",
    observation: "கவனிப்பு", prevention: "தடுப்பு & சிகிச்சை",
    topPredictions: "சிறந்த கணிப்புகள்",
    expertDisclaimer: "* இரசாயன சிகிச்சைகளுக்கு முன்பு நிபுணரை அணுகவும்.",
    historyTitle: "ஸ்கேன் வரலாறு", noHistory: "இன்னும் ஸ்கேன்கள் இல்லை.",
    language: "மொழி", back: "பின்னால்", scanAgain: "மீண்டும் ஸ்கேன்", saveResult: "சேமிக்கப்பட்டது"
  },
  bn: {
    welcomeTitle: "ফসলের রোগ",
    welcomeTitleAccent: "পূর্বাভাস AI",
    welcomeSub: "তাত্ক্ষণিক নির্ণয়ের জন্য গাছের পাতা স্ক্যান করুন।",
    getStarted: "শুরু করুন", howItWorks: "এটি কীভাবে কাজ করে",
    navHome: "হোম", navScan: "স্ক্যান", navHistory: "ইতিহাস", navLibrary: "লাইব্রেরি",
    captureTip: "সঠিক বিশ্লেষণের জন্য গাছের পাতার ফটো আপলোড করুন।",
    camera: "ক্যামেরা", gallery: "গ্যালারি", awaitingInput: "ইনপুটের জন্য অপেক্ষা",
    analyzeBtn: "ফসল বিশ্লেষণ করুন", processingTitle: "পাতা বিশ্লেষণ করা হচ্ছে…",
    processingSub: "CNN মডেল স্ক্যান করছে…",
    diagnosisResult: "রোগ নির্ণয়ের ফলাফল", confidence: "আত্মবিশ্বাস",
    healthy: "সুস্থ", diseased: "রোগ শনাক্ত",
    observation: "পর্যবেক্ষণ", prevention: "প্রতিরোধ ও চিকিৎসা",
    topPredictions: "শীর্ষ পূর্বাভাস",
    expertDisclaimer: "* রাসায়নিক চিকিৎসার আগে বিশেষজ্ঞের পরামর্শ নিন।",
    historyTitle: "স্ক্যান ইতিহাস", noHistory: "এখনও কোন স্ক্যান নেই।",
    language: "ভাষা", back: "পিছনে", scanAgain: "আবার স্ক্যান", saveResult: "সংরক্ষিত"
  },
  gu: {
    welcomeTitle: "પાક રોગ", welcomeTitleAccent: "નિદાન AI",
    welcomeSub: "ઝડપી નિદાન માટે છોડના પાંદડા સ્કેન કરો.",
    getStarted: "શરૂ કરો", howItWorks: "તે કેવી રીતે કાર્ય કરે છે",
    navHome: "હોમ", navScan: "સ્કેન", navHistory: "ઇતિહાસ", navLibrary: "લાઇબ્રેરી",
    captureTip: "ચોક્કસ વિશ્લેષણ માટે ફોટો અપલોડ કરો.",
    camera: "કેમેરા", gallery: "ગેલેરી", awaitingInput: "ઇનપુટ માટે રાહ",
    analyzeBtn: "પાકનું વિશ્લેષણ કરો", processingTitle: "પાંદડું તપાસી રહ્યું છે…",
    processingSub: "CNN મોડેલ સ્કેન કરી રહ્યો છે…",
    diagnosisResult: "નિદાન પરિણામ", confidence: "વિશ્વાસ",
    healthy: "સ્વસ્થ", diseased: "રોગ મળ્યો",
    observation: "નિરીક્ષણ", prevention: "નિવારણ અને ઉપચાર",
    topPredictions: "ટોચની આગાહીઓ",
    expertDisclaimer: "* રાસાયણિક ઉપચાર પહેલા નિષ્ણાતની સલાહ લો.",
    historyTitle: "સ્કેન ઇતિહાસ", noHistory: "હજી સ્કેન નથી.",
    language: "ભાષા", back: "પાછા", scanAgain: "ફરી સ્કેન", saveResult: "સંગ્રહ્યું"
  },
  kn: {
    welcomeTitle: "ಬೆಳೆ ರೋಗ", welcomeTitleAccent: "ಮುನ್ಸೂಚನೆ AI",
    welcomeSub: "ತಕ್ಷಣದ ರೋಗನಿರ್ಣಯಕ್ಕಾಗಿ ಸಸ್ಯದ ಎಲೆಗಳನ್ನು ಸ್ಕ್ಯಾನ್ ಮಾಡಿ.",
    getStarted: "ಪ್ರಾರಂಭಿಸಿ", howItWorks: "ಇದು ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ",
    navHome: "ಮುಖಪುಟ", navScan: "ಸ್ಕ್ಯಾನ್", navHistory: "ಇತಿಹಾಸ", navLibrary: "ಲೈಬ್ರರಿ",
    captureTip: "ನಿಖರವಾದ ವಿಶ್ಲೇಷಣೆಗಾಗಿ ಎಲೆಯ ಫೋಟೋ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ.",
    camera: "ಕ್ಯಾಮೆರಾ", gallery: "ಗ್ಯಾಲರಿ", awaitingInput: "ಇನ್‌ಪುಟ್‌ಗಾಗಿ ಕಾಯುತ್ತಿದೆ",
    analyzeBtn: "ಬೆಳೆಯನ್ನು ವಿಶ್ಲೇಷಿಸಿ", processingTitle: "ಎಲೆ ವಿಶ್ಲೇಷಿಸಲಾಗುತ್ತಿದೆ…",
    processingSub: "CNN ಮಾದರಿ ಸ್ಕ್ಯಾನ್ ಮಾಡುತ್ತಿದೆ…",
    diagnosisResult: "ರೋಗನಿರ್ಣಯ ಫಲಿತಾಂಶ", confidence: "ನಂಬಿಕೆ",
    healthy: "ಆರೋಗ್ಯಕರ", diseased: "ರೋಗ ಪತ್ತೆ",
    observation: "ವೀಕ್ಷಣೆ", prevention: "ತಡೆಗಟ್ಟುವಿಕೆ & ಚಿಕಿತ್ಸೆ",
    topPredictions: "ಟಾಪ್ ಭವಿಷ್ಯವಾಣಿಗಳು",
    expertDisclaimer: "* ರಾಸಾಯನಿಕ ಚಿಕಿತ್ಸೆಗಳನ್ನು ತಜ್ಞರೊಂದಿಗೆ ಸಂಪರ್ಕಿಸಿ.",
    historyTitle: "ಸ್ಕ್ಯಾನ್ ಇತಿಹಾಸ", noHistory: "ಇನ್ನೂ ಯಾವುದೇ ಸ್ಕ್ಯಾನ್‌ಗಳಿಲ್ಲ.",
    language: "ಭಾಷೆ", back: "ಹಿಂದಕ್ಕೆ", scanAgain: "ಮತ್ತೆ ಸ್ಕ್ಯಾನ್", saveResult: "ಉಳಿಸಲಾಗಿದೆ"
  },
  pa: {
    welcomeTitle: "ਫਸਲੀ ਬਿਮਾਰੀ", welcomeTitleAccent: "ਭਵਿੱਖਬਾਣੀ AI",
    welcomeSub: "ਤੁਰੰਤ ਨਿਦਾਨ ਲਈ ਪੌਦਿਆਂ ਦੇ ਪੱਤਿਆਂ ਨੂੰ ਸਕੈਨ ਕਰੋ।",
    getStarted: "ਸ਼ੁਰੂ ਕਰੋ", howItWorks: "ਇਹ ਕਿਵੇਂ ਕੰਮ ਕਰਦਾ ਹੈ",
    navHome: "ਹੋਮ", navScan: "ਸਕੈਨ", navHistory: "ਇਤਿਹਾਸ", navLibrary: "ਲਾਇਬ੍ਰੇਰੀ",
    captureTip: "ਸਹੀ ਵਿਸ਼ਲੇਸ਼ਣ ਲਈ ਪੱਤੇ ਦੀ ਫੋਟੋ ਅਪਲੋਡ ਕਰੋ।",
    camera: "ਕੈਮਰਾ", gallery: "ਗੈਲਰੀ", awaitingInput: "ਇਨਪੁਟ ਦੀ ਉਡੀਕ",
    analyzeBtn: "ਫਸਲ ਦਾ ਵਿਸ਼ਲੇਸ਼ਣ ਕਰੋ", processingTitle: "ਪੱਤਾ ਵਿਸ਼ਲੇਸ਼ਣ ਹੋ ਰਿਹਾ ਹੈ…",
    processingSub: "CNN ਮਾਡਲ ਸਕੈਨ ਕਰ ਰਿਹਾ ਹੈ…",
    diagnosisResult: "ਨਿਦਾਨ ਦਾ ਨਤੀਜਾ", confidence: "ਭਰੋਸਾ",
    healthy: "ਸਿਹਤਮੰਦ", diseased: "ਬਿਮਾਰੀ ਮਿਲੀ",
    observation: "ਨਿਰੀਖਣ", prevention: "ਰੋਕਥਾਮ ਅਤੇ ਇਲਾਜ",
    topPredictions: "ਸਿਖਰ ਭਵਿੱਖਬਾਣੀਆਂ",
    expertDisclaimer: "* ਰਸਾਇਣਕ ਇਲਾਜ ਤੋਂ ਪਹਿਲਾਂ ਮਾਹਰ ਨਾਲ ਸਲਾਹ ਕਰੋ।",
    historyTitle: "ਸਕੈਨ ਇਤਿਹਾਸ", noHistory: "ਅਜੇ ਤੱਕ ਕੋਈ ਸਕੈਨ ਨਹੀਂ।",
    language: "ਭਾਸ਼ਾ", back: "ਪਿੱਛੇ", scanAgain: "ਫਿਰ ਸਕੈਨ", saveResult: "ਸੁਰੱਖਿਅਤ"
  }
};
