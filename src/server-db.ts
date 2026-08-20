import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, getDocs, setDoc, collection, deleteDoc } from 'firebase/firestore';

// --- HELPER TO CLEAN UNDEFINED VALUES FOR FIRESTORE ---
export function cleanFirestoreData<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(item => cleanFirestoreData(item)) as unknown as T;
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleaned[key] = cleanFirestoreData(value);
      }
    }
    return cleaned as T;
  }
  return data;
}

// --- DATABASE INTERFACES ---

export interface UserPrivileges {
  canManageOrders: boolean;
  canValidateQuality: boolean;
  canDeliverOrders: boolean;
  canManageClients: boolean;
  canManageTools: boolean;
  canViewFinancials: boolean;
}

export function getDefaultPrivileges(role: 'admin' | 'partner' | 'operator' | 'qa' | 'client' | 'assistant' | string): UserPrivileges {
  switch (role) {
    case 'admin':
      return {
        canManageOrders: true,
        canValidateQuality: true,
        canDeliverOrders: true,
        canManageClients: true,
        canManageTools: true,
        canViewFinancials: true,
      };
    case 'assistant':
      return {
        canManageOrders: true,
        canValidateQuality: true,
        canDeliverOrders: true,
        canManageClients: true,
        canManageTools: true,
        canViewFinancials: true,
      };
    case 'qa':
      return {
        canManageOrders: true,
        canValidateQuality: true,
        canDeliverOrders: true,
        canManageClients: false,
        canManageTools: true,
        canViewFinancials: false,
      };
    case 'operator':
      return {
        canManageOrders: true,
        canValidateQuality: false,
        canDeliverOrders: false,
        canManageClients: false,
        canManageTools: true,
        canViewFinancials: false,
      };
    case 'partner':
      return {
        canManageOrders: true,
        canValidateQuality: false,
        canDeliverOrders: false,
        canManageClients: true,
        canManageTools: true,
        canViewFinancials: true,
      };
    default:
      return {
        canManageOrders: false,
        canValidateQuality: false,
        canDeliverOrders: false,
        canManageClients: false,
        canManageTools: false,
        canViewFinancials: false,
      };
  }
}

export interface User {
  id: string;
  name: string;
  username?: string;
  email: string;
  password?: string;
  role: 'admin' | 'partner' | 'operator' | 'qa' | 'client' | 'assistant' | 'affiliate';
  privileges?: UserPrivileges;
  company?: string;
  ice?: string;
  phone?: string;
  address?: string;
  city?: string;
  active: boolean;
  geminiApiKey?: string;
  createdByUserId?: string;
  createdByRole?: 'client' | 'partner' | 'admin';
  createdAt?: string;
  // --- Affiliate Fields ---
  affiliateCode?: string;
  affiliateLink?: string;
  commissionRate?: number; // e.g. 10 (%)
  affiliateStatus?: 'active' | 'inactive';
  referredByAffiliateCode?: string;
  referredByAffiliateId?: string;
  // --- Employee & HR Fields ---
  employeeCode?: string; // Matricule (ex: EMP-001)
  jobTitle?: string; // Poste (ex: Opérateur de saisie principal, Responsable Contrôle Qualité, Assistante Administrative)
  department?: 'production' | 'qualite' | 'administration' | 'support' | 'commercial' | 'direction';
  contractType?: 'cdi' | 'cdd' | 'freelance' | 'stage' | 'interim';
  hireDate?: string;
  birthDate?: string;
  cinNumber?: string; // Carte d'Identité Nationale (ex: BK123456)
  cnssNumber?: string; // Numéro d'immatriculation CNSS
  ribNumber?: string; // RIB bancaire 24 chiffres
  bankName?: string; // Nom de la banque
  baseSalary?: number; // Salaire de base mensuel en DH
  hourlyRate?: number; // Taux horaire (si applicable)
  pieceRate?: number; // Tarif par page traitée
  vacationBalance?: number; // Solde de congés restants (en jours)
  emergencyContact?: { name: string; relation: string; phone: string };
  notes?: string;
  status?: 'active' | 'inactive' | 'on_leave' | 'suspended';
  // --- Client profile fields ---
  customerType?: 'particular' | 'company' | 'partner';
  clientNotes?: string;
}

export interface PayrollRecord {
  id: string;
  reference: string; // e.g. PAY-2026-08-001
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  jobTitle?: string;
  department?: string;
  periodMonth: string; // "2026-08"
  periodLabel: string; // "Août 2026"
  contractType?: string;
  workedDays: number;
  absentDays: number;
  overtimeHours: number;
  overtimeAmount: number;
  hourlyRate?: number;
  baseSalary: number;
  productionBonus: number;
  attendanceBonus: number;
  seniorityBonus: number;
  customBonus: number;
  grossSalary: number;
  cnssDeduction: number;
  amoDeduction: number;
  advanceDeduction: number;
  absenceDeduction: number;
  otherDeduction: number;
  totalDeductions: number;
  netSalary: number;
  netSalaryInWords?: string;
  paymentMethod: 'transfer' | 'cash' | 'cheque';
  paymentReference?: string;
  status: 'draft' | 'validated' | 'paid';
  paidAt?: string;
  notes?: string;
  generatedBy?: string;
  createdAt: string;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  type: 'paid_leave' | 'sick_leave' | 'unpaid_leave' | 'exceptional' | 'maternity_paternity';
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  createdAt: string;
}

export interface SalaryAdvance {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  requestDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'deducted';
  repaymentMonth: string; // e.g. "2026-08"
  approvedBy?: string;
  approvedAt?: string;
}

export interface AffiliateCommission {
  id: string;
  reference?: string;
  affiliateId: string;
  affiliateName: string;
  affiliateCode: string;
  clientId: string;
  clientName: string;
  orderId: string;
  orderReference: string;
  serviceName: string;
  paymentId?: string;
  paymentReference?: string;
  orderTotalAmount: number;
  paidAmount: number;
  paymentAmount?: number;
  commissionRate: number; // percentage e.g. 10
  commissionAmount: number; // calculated e.g. 10
  status: 'pending' | 'validated' | 'requested' | 'paid' | 'cancelled';
  createdAt: string;
  validatedAt?: string;
  requestedAt?: string;
  paidAt?: string;
  debitNoteReference?: string;
  bankName?: string;
  ribNumber?: string;
  notes?: string;
}

export interface PartnerCustomer {
  id: string;
  partnerId: string;
  name: string;
  email: string;
  phone: string;
  company?: string;
  city: string;
  address?: string;
  notes?: string;
  createdAt: string;
}

export interface ServiceOption {
  id: string;
  name: string;
  price: number;
}

export interface Service {
  id: string;
  name: string;
  category: 'saisie' | 'conversion' | 'mise_en_forme' | 'traitement' | 'impression' | 'livraison';
  description: string;
  priceMethod: 'fixed' | 'per_page' | 'per_word' | 'per_hour' | 'hybrid';
  basePrice: number;
  unitPriceName: string; // e.g., 'Page', 'Mot', 'Heure'
  unitPrice: number;
  isActive: boolean;
  options: ServiceOption[];
  imageUrl?: string;
}

export interface OrderFile {
  id: string;
  name: string;
  type: string;
  size: number;
  folder: '01_DOCUMENTS_ORIGINAUX' | '02_DOCUMENTS_SUPPLEMENTAIRES' | '03_TRAVAIL_EN_COURS' | '04_PREVISUALISATION' | '05_VERSION_FINALE' | '06_FACTURES' | '07_PREUVES' | '08_LIVRAISON';
  version: number;
  uploadedBy: string;
  uploadedAt: string;
  base64Data?: string; // Stored locally for simulation
}

export interface OrderMessage {
  id: string;
  senderName: string;
  senderRole: string;
  message: string;
  timestamp: string;
  isInternal: boolean; // separate client chat from internal team notes
  fileName?: string;
  fileBase64?: string;
}

export interface OrderTask {
  id: string;
  operatorId: string;
  operatorName: string;
  qaId?: string;
  qaName?: string;
  deadline: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' | 'CRITICAL';
  completed: boolean;
  notes?: string;
}

export interface QuoteItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Quote {
  id: string;
  reference: string;
  orderId: string;
  basePrice: number;
  optionsPrice: number;
  urgencySurcharge: number;
  printingPrice: number;
  deliveryPrice: number;
  totalAmount: number;
  depositPercent: number;
  depositAmount: number;
  balanceAmount: number;
  status: 'draft' | 'sent' | 'accepted' | 'refused';
  validityDate: string;
  items: QuoteItem[];
}

export interface OrderRevision {
  id: string;
  revisionNumber: number;
  requestedBy: string;
  requestedByRole: string;
  notes: string;
  attachmentName?: string;
  attachmentBase64?: string;
  status: 'pending' | 'in_progress' | 'delivered' | 'accepted' | 'rejected';
  createdAt: string;
  resolvedAt?: string;
  deliveredFileName?: string;
  deliveredFileBase64?: string;
  adminResponseNotes?: string;
}

export interface ClientSatisfaction {
  isSatisfied: boolean;
  rating?: number; // 1 to 5
  feedback?: string;
  validatedAt?: string;
}

export interface Invoice {
  id: string;
  reference: string;
  orderId: string;
  quoteId: string;
  amount: number;
  type: 'deposit' | 'balance' | 'full';
  status: 'unpaid' | 'paid';
  date: string;
}

export interface Payment {
  id: string;
  reference: string;
  orderId: string;
  orderReference?: string;
  amount: number;
  type?: 'deposit' | 'balance' | 'full';
  method?: 'cash' | 'transfer' | 'cheque' | 'bill_of_exchange' | 'cod' | 'online' | 'manual';
  paymentMethod?: string;
  status: 'pending' | 'verified' | 'rejected';
  referenceNumber?: string; // Check number, transfer ref, LCN number
  dueDate?: string; // Due date for check or bill of exchange
  proofFileName?: string;
  proofFileBase64?: string;
  proofUrl?: string;
  date?: string;
  paymentDate?: string;
  verifiedAt?: string;
  notes?: string;
}

export interface DeliveryDetails {
  method: 'digital' | 'email' | 'physical_partner' | 'physical_shipper';
  name?: string;
  phone?: string;
  address?: string;
  city?: string;
  district?: string;
  trackingNumber?: string;
  status: 'preparation' | 'shipped' | 'delivering' | 'delivered';
}

export interface QualityChecklist {
  allPagesProcessed: boolean;
  noMissingDocs: boolean;
  spellingVerified: boolean;
  layoutVerified: boolean;
  numberingVerified: boolean;
  filesOpenCorrectly: boolean;
  formatRespected: boolean;
  fileNamesCorrect: boolean;
  finalVersionValidated: boolean;
  validatedBy?: string;
  validatedAt?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  orderId?: string;
  orderReference?: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface SystemSettings {
  companyName: string;
  logoUrl?: string;
  address: string;
  phone: string;
  email: string;
  currency: string; // default DH
  taxRate: number; // default 0
  globalGeminiApiKey?: string;
  globalGeminiApiKeyEnabled?: boolean;
  depositRules: {
    normal: number; // e.g. 50
    fast: number; // e.g. 60
    urgent: number; // e.g. 70
    very_urgent: number; // e.g. 80
  };
  urgencySurcharges: {
    normal: number; // 0%
    fast: number; // 30%
    urgent: number; // 60%
    very_urgent: number; // 100%
  };
  saasWorkspaceTitle?: string;
  databaseType?: 'firebase' | 'supabase' | 'mysql' | 'mariadb';
  isSetupCompleted?: boolean;
  dbConfig?: {
    host?: string;
    port?: number;
    databaseName?: string;
    username?: string;
    password?: string;
    connected?: boolean;
    lastTestedAt?: string;
  };
  googleDriveAccounts?: {
    id: string;
    name: string;
    email: string;
    folderId?: string;
    completedFolderId?: string;
    status: 'connected' | 'disconnected';
    createdAt: string;
  }[];
  resourceDocuments?: {
    id: string;
    name: string;
    category: 'legal' | 'template' | 'example' | 'other';
    classification: string;
    uploadedBy: string;
    uploadedAt: string;
    size: number;
    type: string;
    base64Data: string;
    externalUrl?: string;
  }[];
  googleDriveTransferLogs?: {
    id: string;
    timestamp: string;
    accountName: string;
    fileName: string;
    type: 'client_upload' | 'completed_work' | 'resource_doc';
    status: 'success' | 'failed';
    details: string;
  }[];
}

export interface Order {
  id: string;
  reference: string;
  customerType: 'particular' | 'company' | 'partner';
  customerDetails: {
    name: string;
    email: string;
    phone: string;
    company?: string;
    city: string;
    address?: string;
    remarks?: string;
  };
  partnerId?: string; // if created by partner
  serviceId: string;
  serviceName: string;
  serviceCategory: string;
  description: string;
  quantity: number; // pages, hours, etc.
  urgency: 'normal' | 'fast' | 'urgent' | 'very_urgent';
  status:
    | 'BROUILLON'
    | 'DEMANDE_ENVOYEE'
    | 'EN_ATTENTE_ANALYSE'
    | 'DEVIS_EN_PREPARATION'
    | 'DEVIS_ENVOYE'
    | 'EN_ATTENTE_ACCEPTATION'
    | 'ACCEPTE'
    | 'EN_ATTENTE_ACOMPTE'
    | 'ACOMPTE_PAYE'
    | 'DOCUMENTS_RECLUS'
    | 'EN_FILE_ATTENTE'
    | 'EN_TRAITEMENT'
    | 'CONTROLE_QUALITE'
    | 'TRAVAIL_TERMINE'
    | 'EN_ATTENTE_SOLDE'
    | 'SOLDE_PAYE'
    | 'PRET_A_LIVRER'
    | 'LIVRE'
    | 'TERMINE'
    | 'ANNULE'
    | 'REFUSE'
    | 'BLOQUE'
    | 'EN_ATTENTE_INFOS'
    | 'EN_ATTENTE_DOCUMENT';
  files: OrderFile[];
  messages: OrderMessage[];
  tasks: OrderTask[];
  quoteId?: string;
  delivery?: DeliveryDetails;
  qualityChecklist?: QualityChecklist;
  paymentMethod?: 'cash' | 'transfer' | 'cheque' | 'bill_of_exchange' | 'cod' | 'online';
  paymentTerms?: 'immediate' | 'cod' | 'net_7' | 'net_15' | 'net_30' | 'net_60' | 'net_90' | 'custom';
  customDueDate?: string;
  revisions?: OrderRevision[];
  clientSatisfaction?: ClientSatisfaction;
  // --- Affiliate Fields ---
  affiliateId?: string;
  affiliateCode?: string;
  affiliateName?: string;
  commissionRate?: number;
  createdAt: string;
  updatedAt: string;
  deadline?: string;
}

export interface AppDatabase {
  users: User[];
  partners: User[];
  partnerCustomers: PartnerCustomer[];
  services: Service[];
  orders: Order[];
  quotes: Quote[];
  invoices: Invoice[];
  payments: Payment[];
  auditLogs: AuditLog[];
  notifications: AppNotification[];
  payrolls: PayrollRecord[];
  leaveRequests: LeaveRequest[];
  salaryAdvances: SalaryAdvance[];
  affiliateCommissions: AffiliateCommission[];
  settings: SystemSettings;
}

// --- FIREBASE INITIALIZATION ---

let firebaseConfig: Record<string, string>;

try {
  const configPath = join(process.cwd(), 'firebase-applet-config.json');
  if (existsSync(configPath)) {
    firebaseConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
  } else if (process.env['FIREBASE_CONFIG']) {
    firebaseConfig = JSON.parse(process.env['FIREBASE_CONFIG']!);
  } else {
    firebaseConfig = {
      projectId: "reflecting-pattern-d79b0",
      appId: "1:893983542054:web:324dcf1b928b8dfe3f0fe7",
      apiKey: "AIzaSyDouXst_SDb_C6dy9oHGp14osC9knBMjAo",
      authDomain: "reflecting-pattern-d79b0.firebaseapp.com",
      firestoreDatabaseId: "ai-studio-remixgestiondetr-a8f577d6-5c9e-4145-aab5-07d8f9ac7af4",
      storageBucket: "reflecting-pattern-d79b0.firebasestorage.app",
      messagingSenderId: "893983542054",
      measurementId: "",
      oAuthClientId: "893983542054-mpcrs32ohq38rfi85dt7iotlcrisi186.apps.googleusercontent.com",
      recaptchaSiteKey: ""
    };
  }
} catch {
  firebaseConfig = {
    projectId: "reflecting-pattern-d79b0",
    appId: "1:893983542054:web:324dcf1b928b8dfe3f0fe7",
    apiKey: "AIzaSyDouXst_SDb_C6dy9oHGp14osC9knBMjAo",
    authDomain: "reflecting-pattern-d79b0.firebaseapp.com",
    firestoreDatabaseId: "ai-studio-remixgestiondetr-a8f577d6-5c9e-4145-aab5-07d8f9ac7af4",
    storageBucket: "reflecting-pattern-d79b0.firebasestorage.app",
    messagingSenderId: "893983542054",
    measurementId: "",
    oAuthClientId: "893983542054-mpcrs32ohq38rfi85dt7iotlcrisi186.apps.googleusercontent.com",
    recaptchaSiteKey: ""
  };
}

const firebaseApp = initializeApp(firebaseConfig);
export const db = initializeFirestore(firebaseApp, {
  experimentalForceLongPolling: true
}, firebaseConfig['firestoreDatabaseId'] || 'ai-studio-remixgestiondetr-a8f577d6-5c9e-4145-aab5-07d8f9ac7af4');
export const auth = getAuth(firebaseApp);

async function ensureAuthenticated() {
  // Server runs in a secure backend environment; no client-side anonymous auth is required.
  return Promise.resolve();
}

// --- ERROR HANDLING ---

export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
} as const;

export type OperationType = typeof OperationType[keyof typeof OperationType];

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- DB STORAGE LOGIC VIA FIRESTORE ---

// --- DB CACHING VARIABLES ---
let cachedDatabaseState: AppDatabase | null = null;
let cacheTimestamp = 0;
let activeLoadPromise: Promise<AppDatabase> | null = null;
const CACHE_TTL_MS = 4000; // 4 seconds cache TTL

export function loadDatabase(): Promise<AppDatabase> {
  const now = Date.now();
  
  if (cachedDatabaseState && (now - cacheTimestamp < CACHE_TTL_MS)) {
    return Promise.resolve(cachedDatabaseState);
  }
  
  if (activeLoadPromise) {
    return activeLoadPromise;
  }
  
  activeLoadPromise = (async () => {
    await ensureAuthenticated();
    try {
      const [
      usersSnap,
      partnerCustomersSnap,
      servicesSnap,
      ordersSnap,
      quotesSnap,
      invoicesSnap,
      paymentsSnap,
      auditLogsSnap,
      notificationsSnap,
      payrollsSnap,
      leaveRequestsSnap,
      salaryAdvancesSnap,
      affiliateCommissionsSnap,
      settingsSnap
    ] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'partnerCustomers')),
      getDocs(collection(db, 'services')),
      getDocs(collection(db, 'orders')),
      getDocs(collection(db, 'quotes')),
      getDocs(collection(db, 'invoices')),
      getDocs(collection(db, 'payments')),
      getDocs(collection(db, 'auditLogs')),
      getDocs(collection(db, 'notifications')),
      getDocs(collection(db, 'payrolls')),
      getDocs(collection(db, 'leaveRequests')),
      getDocs(collection(db, 'salaryAdvances')),
      getDocs(collection(db, 'affiliateCommissions')),
      getDoc(doc(db, 'settings', 'global'))
    ]);

    const users: User[] = [];
    usersSnap.forEach(d => users.push(d.data() as User));

    const partnerCustomers: PartnerCustomer[] = [];
    partnerCustomersSnap.forEach(d => partnerCustomers.push(d.data() as PartnerCustomer));

    const services: Service[] = [];
    servicesSnap.forEach(d => services.push(d.data() as Service));

    const orders: Order[] = [];
    ordersSnap.forEach(d => orders.push(d.data() as Order));

    const quotes: Quote[] = [];
    quotesSnap.forEach(d => quotes.push(d.data() as Quote));

    const invoices: Invoice[] = [];
    invoicesSnap.forEach(d => invoices.push(d.data() as Invoice));

    const payments: Payment[] = [];
    paymentsSnap.forEach(d => payments.push(d.data() as Payment));

    const auditLogs: AuditLog[] = [];
    auditLogsSnap.forEach(d => auditLogs.push(d.data() as AuditLog));

    const notifications: AppNotification[] = [];
    notificationsSnap.forEach(d => notifications.push(d.data() as AppNotification));

    const payrolls: PayrollRecord[] = [];
    payrollsSnap.forEach(d => payrolls.push(d.data() as PayrollRecord));

    const leaveRequests: LeaveRequest[] = [];
    leaveRequestsSnap.forEach(d => leaveRequests.push(d.data() as LeaveRequest));

    const salaryAdvances: SalaryAdvance[] = [];
    salaryAdvancesSnap.forEach(d => salaryAdvances.push(d.data() as SalaryAdvance));

    const affiliateCommissions: AffiliateCommission[] = [];
    affiliateCommissionsSnap.forEach(d => affiliateCommissions.push(d.data() as AffiliateCommission));

    let settings: SystemSettings;
    if (settingsSnap.exists()) {
      settings = settingsSnap.data() as SystemSettings;
    } else {
      const seeded = getSeededDatabase();
      settings = seeded.settings;
      await setDoc(doc(db, 'settings', 'global'), cleanFirestoreData(settings));
    }

    if (users.length === 0 && services.length === 0 && orders.length === 0) {
      console.log("Database is empty, seeding Firestore database...");
      const seeded = getSeededDatabase();
      await saveDatabase(seeded);
      return seeded;
    }

    // Ensure administrator accounts and core employees are always present
    const defaultAdmins: User[] = [
      {
        id: "usr-admin-1",
        name: "Administrateur Principal (Boguiman)",
        username: "boguiman",
        email: "boguiman@gmail.com",
        password: "admin123",
        role: "admin",
        phone: "+212 661-000001",
        city: "Casablanca",
        employeeCode: "DIR-001",
        jobTitle: "Directeur Général",
        department: "direction",
        contractType: "cdi",
        hireDate: "2024-01-01",
        cinNumber: "BK100200",
        cnssNumber: "123456789",
        ribNumber: "011780000012345678901234",
        bankName: "Attijariwafa Bank",
        baseSalary: 18000,
        vacationBalance: 22,
        active: true
      },
      {
        id: "usr-admin-2",
        name: "Administrateur (Nabil)",
        username: "nabil",
        email: "nabilniyo122@gmail.com",
        password: "admin123",
        role: "admin",
        phone: "+212 661-112233",
        city: "Casablanca",
        employeeCode: "DIR-002",
        jobTitle: "Directeur des Opérations",
        department: "direction",
        contractType: "cdi",
        hireDate: "2024-02-01",
        cinNumber: "BK200300",
        cnssNumber: "234567890",
        ribNumber: "011780000098765432109876",
        bankName: "Banque Populaire",
        baseSalary: 16000,
        vacationBalance: 20,
        active: true
      },
      {
        id: "usr-admin-3",
        name: "Administrateur Système",
        username: "admin",
        email: "admin@remix.ma",
        password: "admin123",
        role: "admin",
        phone: "+212 522-123456",
        city: "Casablanca",
        employeeCode: "ADM-001",
        jobTitle: "Administrateur Système & Sécurité",
        department: "administration",
        contractType: "cdi",
        hireDate: "2024-01-15",
        cinNumber: "BK300400",
        cnssNumber: "345678901",
        ribNumber: "011780000045612378945612",
        bankName: "BMCE Bank of Africa",
        baseSalary: 12000,
        vacationBalance: 18,
        active: true
      },
      {
        id: "usr-assistant-1",
        name: "Yassine Mansouri",
        username: "assistant",
        email: "assistant@digidocs.ma",
        password: "assistant123",
        role: "assistant",
        phone: "+212 661-998877",
        city: "Casablanca",
        employeeCode: "AST-001",
        jobTitle: "Assistante Administrative & Facturation",
        department: "administration",
        contractType: "cdi",
        hireDate: "2024-06-01",
        cinNumber: "BL456789",
        cnssNumber: "456789012",
        ribNumber: "011780000033221144556677",
        bankName: "Société Générale Maroc",
        baseSalary: 6500,
        vacationBalance: 15,
        emergencyContact: { name: "Fatima Mansouri", relation: "Mère", phone: "+212 661-001122" },
        active: true
      },
      {
        id: "usr-op-1",
        name: "Mehdi Tazi",
        username: "mehdi.tazi",
        email: "mehdi.op@digidocs.ma",
        password: "password123",
        role: "operator",
        phone: "+212 662-114477",
        city: "Casablanca",
        employeeCode: "EMP-001",
        jobTitle: "Opérateur de Saisie Senior",
        department: "production",
        contractType: "cdi",
        hireDate: "2024-03-01",
        cinNumber: "BE123987",
        cnssNumber: "567890123",
        ribNumber: "011780000077889944556611",
        bankName: "CIH Bank",
        baseSalary: 4500,
        hourlyRate: 35,
        pieceRate: 1.5,
        vacationBalance: 14,
        emergencyContact: { name: "Karim Tazi", relation: "Frère", phone: "+212 662-334455" },
        active: true
      },
      {
        id: "usr-op-2",
        name: "Salma Alami",
        username: "salma.alami",
        email: "salma.op@digidocs.ma",
        password: "password123",
        role: "operator",
        phone: "+212 663-887766",
        city: "Rabat",
        employeeCode: "EMP-002",
        jobTitle: "Opératrice PAO & Traitement OCR",
        department: "production",
        contractType: "cdd",
        hireDate: "2024-09-01",
        cinNumber: "BE987654",
        cnssNumber: "678901234",
        ribNumber: "011780000011223344556677",
        bankName: "Attijariwafa Bank",
        baseSalary: 4800,
        hourlyRate: 38,
        pieceRate: 1.8,
        vacationBalance: 12,
        emergencyContact: { name: "Omar Alami", relation: "Père", phone: "+212 663-112233" },
        active: true
      },
      {
        id: "usr-qa-1",
        name: "Karim Berrada",
        username: "karim.qa",
        email: "karim.qa@digidocs.ma",
        password: "password123",
        role: "qa",
        phone: "+212 664-556677",
        city: "Casablanca",
        employeeCode: "QA-001",
        jobTitle: "Responsable Contrôle Qualité & Relecture",
        department: "qualite",
        contractType: "cdi",
        hireDate: "2024-04-15",
        cinNumber: "BH776655",
        cnssNumber: "789012345",
        ribNumber: "011780000099887766554433",
        bankName: "Crédit du Maroc",
        baseSalary: 6000,
        vacationBalance: 16,
        emergencyContact: { name: "Nadia Berrada", relation: "Épouse", phone: "+212 664-998877" },
        active: true
      }
    ];

    for (const admin of defaultAdmins) {
      const existing = users.find(u => 
        u.email.toLowerCase() === admin.email.toLowerCase() || 
        (u.username && admin.username && u.username.toLowerCase() === admin.username.toLowerCase())
      );
      if (!existing) {
        users.push(admin);
        await setDoc(doc(db, 'users', admin.id), cleanFirestoreData(admin));
      } else {
        let updated = false;
        if (!existing.password || !existing.username) {
          existing.password = existing.password || admin.password;
          existing.username = existing.username || admin.username;
          updated = true;
        }
        if (!existing.employeeCode && admin.employeeCode) {
          existing.employeeCode = admin.employeeCode;
          existing.jobTitle = admin.jobTitle;
          existing.department = admin.department;
          existing.contractType = admin.contractType;
          existing.baseSalary = admin.baseSalary;
          existing.hireDate = admin.hireDate;
          existing.cinNumber = admin.cinNumber;
          existing.cnssNumber = admin.cnssNumber;
          existing.ribNumber = admin.ribNumber;
          existing.bankName = admin.bankName;
          existing.vacationBalance = admin.vacationBalance;
          updated = true;
        }
        if (updated) {
          await setDoc(doc(db, 'users', existing.id), cleanFirestoreData(existing));
        }
      }
    }

    const resultState = {
      users,
      partners: users.filter(u => u.role === 'partner'),
      partnerCustomers,
      services,
      orders,
      quotes,
      invoices,
      payments,
      auditLogs,
      notifications,
      payrolls,
      leaveRequests,
      salaryAdvances,
      affiliateCommissions,
      settings
    };
    cachedDatabaseState = resultState;
    cacheTimestamp = Date.now();
    return resultState;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'database_load');
    throw err;
  } finally {
    activeLoadPromise = null;
  }
  })();
  return activeLoadPromise;
}

export async function saveDatabase(databaseState: AppDatabase): Promise<void> {
  cachedDatabaseState = databaseState;
  cacheTimestamp = Date.now();
  await ensureAuthenticated();
  try {
    const promises: Promise<void>[] = [];

    databaseState.users.forEach(u => {
      promises.push(setDoc(doc(db, 'users', u.id), cleanFirestoreData(u)));
    });
    databaseState.partnerCustomers.forEach(pc => {
      promises.push(setDoc(doc(db, 'partnerCustomers', pc.id), cleanFirestoreData(pc)));
    });
    databaseState.services.forEach(s => {
      promises.push(setDoc(doc(db, 'services', s.id), cleanFirestoreData(s)));
    });
    databaseState.orders.forEach(o => {
      promises.push(setDoc(doc(db, 'orders', o.id), cleanFirestoreData(o)));
    });
    databaseState.quotes.forEach(q => {
      promises.push(setDoc(doc(db, 'quotes', q.id), cleanFirestoreData(q)));
    });
    databaseState.invoices.forEach(i => {
      promises.push(setDoc(doc(db, 'invoices', i.id), cleanFirestoreData(i)));
    });
    databaseState.payments.forEach(p => {
      promises.push(setDoc(doc(db, 'payments', p.id), cleanFirestoreData(p)));
    });
    databaseState.auditLogs.forEach(al => {
      promises.push(setDoc(doc(db, 'auditLogs', al.id), cleanFirestoreData(al)));
    });
    if (databaseState.notifications) {
      databaseState.notifications.forEach(n => {
        promises.push(setDoc(doc(db, 'notifications', n.id), cleanFirestoreData(n)));
      });
    }
    if (databaseState.payrolls) {
      databaseState.payrolls.forEach(pay => {
        promises.push(setDoc(doc(db, 'payrolls', pay.id), cleanFirestoreData(pay)));
      });
    }
    if (databaseState.leaveRequests) {
      databaseState.leaveRequests.forEach(lr => {
        promises.push(setDoc(doc(db, 'leaveRequests', lr.id), cleanFirestoreData(lr)));
      });
    }
    if (databaseState.salaryAdvances) {
      databaseState.salaryAdvances.forEach(sa => {
        promises.push(setDoc(doc(db, 'salaryAdvances', sa.id), cleanFirestoreData(sa)));
      });
    }
    if (databaseState.affiliateCommissions) {
      databaseState.affiliateCommissions.forEach(ac => {
        promises.push(setDoc(doc(db, 'affiliateCommissions', ac.id), cleanFirestoreData(ac)));
      });
    }

    promises.push(setDoc(doc(db, 'settings', 'global'), cleanFirestoreData(databaseState.settings)));

    await Promise.all(promises);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'database_save');
    throw err;
  }
}

export async function resetDatabase(): Promise<void> {
  cachedDatabaseState = null;
  cacheTimestamp = 0;
  await ensureAuthenticated();
  try {
    const [
      usersSnap,
      partnerCustomersSnap,
      servicesSnap,
      ordersSnap,
      quotesSnap,
      invoicesSnap,
      paymentsSnap,
      auditLogsSnap,
      notificationsSnap,
      payrollsSnap,
      leaveRequestsSnap,
      salaryAdvancesSnap,
      affiliateCommissionsSnap
    ] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'partnerCustomers')),
      getDocs(collection(db, 'services')),
      getDocs(collection(db, 'orders')),
      getDocs(collection(db, 'quotes')),
      getDocs(collection(db, 'invoices')),
      getDocs(collection(db, 'payments')),
      getDocs(collection(db, 'auditLogs')),
      getDocs(collection(db, 'notifications')),
      getDocs(collection(db, 'payrolls')),
      getDocs(collection(db, 'leaveRequests')),
      getDocs(collection(db, 'salaryAdvances')),
      getDocs(collection(db, 'affiliateCommissions'))
    ]);

    const deletePromises: Promise<void>[] = [];
    usersSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
    partnerCustomersSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
    servicesSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
    ordersSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
    quotesSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
    invoicesSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
    paymentsSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
    auditLogsSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
    notificationsSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
    payrollsSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
    leaveRequestsSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
    salaryAdvancesSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
    affiliateCommissionsSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));

    await Promise.all(deletePromises);

    const seeded = getSeededDatabase();
    await saveDatabase(seeded);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, 'database_reset');
    throw err;
  }
}

export async function purgeDatabase(): Promise<void> {
  await ensureAuthenticated();
  try {
    const [
      usersSnap,
      partnerCustomersSnap,
      servicesSnap,
      ordersSnap,
      quotesSnap,
      invoicesSnap,
      paymentsSnap,
      auditLogsSnap,
      notificationsSnap,
      payrollsSnap,
      leaveRequestsSnap,
      salaryAdvancesSnap,
      affiliateCommissionsSnap
    ] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'partnerCustomers')),
      getDocs(collection(db, 'services')),
      getDocs(collection(db, 'orders')),
      getDocs(collection(db, 'quotes')),
      getDocs(collection(db, 'invoices')),
      getDocs(collection(db, 'payments')),
      getDocs(collection(db, 'auditLogs')),
      getDocs(collection(db, 'notifications')),
      getDocs(collection(db, 'payrolls')),
      getDocs(collection(db, 'leaveRequests')),
      getDocs(collection(db, 'salaryAdvances')),
      getDocs(collection(db, 'affiliateCommissions'))
    ]);

    const deletePromises: Promise<void>[] = [];
    usersSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
    partnerCustomersSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
    servicesSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
    ordersSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
    quotesSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
    invoicesSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
    paymentsSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
    auditLogsSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
    notificationsSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
    payrollsSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
    leaveRequestsSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
    salaryAdvancesSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
    affiliateCommissionsSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));

    await Promise.all(deletePromises);

    const adminUser: User = {
      id: 'usr-admin-boguiman',
      name: 'Administrateur Principal (Boguiman)',
      username: 'boguiman',
      email: 'boguiman@gmail.com',
      password: 'admin123',
      role: 'admin',
      privileges: getDefaultPrivileges('admin'),
      active: true,
      createdAt: new Date().toISOString()
    };

    const emptyDb: AppDatabase = {
      users: [adminUser],
      partners: [],
      partnerCustomers: [],
      services: [],
      orders: [],
      quotes: [],
      invoices: [],
      payments: [],
      auditLogs: [],
      notifications: [],
      payrolls: [],
      leaveRequests: [],
      salaryAdvances: [],
      affiliateCommissions: [],
      settings: {
        companyName: "DigiDocs Services SARL",
        address: "14 Boulevard d'Anfa, Étage 3, Casablanca, Maroc",
        phone: "+212 522-123456",
        email: "contact@digidocs.ma",
        currency: "DH",
        taxRate: 20,
        databaseType: 'firebase',
        dbConfig: { connected: true, lastTestedAt: new Date().toISOString() },
        depositRules: { normal: 50, fast: 60, urgent: 70, very_urgent: 80 },
        urgencySurcharges: { normal: 0, fast: 30, urgent: 60, very_urgent: 100 },
        saasWorkspaceTitle: "SAAS WORKSPACE",
        googleDriveAccounts: [],
        resourceDocuments: [],
        googleDriveTransferLogs: []
      }
    };

    await saveDatabase(emptyDb);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, 'database_purge');
    throw err;
  }
}

export async function deleteFirestoreDoc(collectionName: string, id: string): Promise<void> {
  await ensureAuthenticated();
  try {
    await deleteDoc(doc(db, collectionName, id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, collectionName);
  }
}

export async function logAction(userId: string, userName: string, action: string, details: string): Promise<void> {
  await ensureAuthenticated();
  try {
    const log: AuditLog = {
      id: 'LOG-' + Math.random().toString(36).substring(2, 9).toUpperCase(),
      timestamp: new Date().toISOString(),
      userId,
      userName,
      action,
      details
    };
    await setDoc(doc(db, 'auditLogs', log.id), log);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'auditLogs');
  }
}

// --- INITIAL DATA SEEDING ---

function getSeededDatabase(): AppDatabase {
  const defaultSettings: SystemSettings = {
    companyName: "DigiDocs Services SARL",
    logoUrl: "",
    address: "14 Boulevard d'Anfa, Étage 3, Casablanca, Maroc",
    phone: "+212 522-123456",
    email: "contact@digidocs.ma",
    currency: "DH",
    taxRate: 20, // 20% VAT in Morocco
    globalGeminiApiKey: "",
    globalGeminiApiKeyEnabled: true,
    depositRules: {
      normal: 50,
      fast: 60,
      urgent: 70,
      very_urgent: 80
    },
    urgencySurcharges: {
      normal: 0,
      fast: 30,
      urgent: 60,
      very_urgent: 100
    },
    saasWorkspaceTitle: "SAAS WORKSPACE",
    googleDriveAccounts: [],
    resourceDocuments: [],
    googleDriveTransferLogs: []
  };

  const services: Service[] = [
    {
      id: "srv-1",
      name: "Saisie de manuscrit manuscrit vers Word",
      category: "saisie",
      description: "Transformation de manuscrits rédigés à la main en documents Word parfaitement formatés.",
      priceMethod: "per_page",
      basePrice: 0,
      unitPriceName: "Page",
      unitPrice: 2.00, // 2 DH per page
      isActive: true,
      options: [
        { id: "opt-1-1", name: "Correction de texte avancée (+0.5 DH/Page)", price: 0.50 },
        { id: "opt-1-2", name: "Mise en page professionnelle complexe (+0.5 DH/Page)", price: 0.50 },
        { id: "opt-1-3", name: "Insertion de table des matières et index (+20 DH fixe)", price: 20.00 }
      ]
    },
    {
      id: "srv-2",
      name: "Saisie de listes et tableaux Excel",
      category: "saisie",
      description: "Saisie, tri et classement de données manuscrites ou scannées dans des tableaux Excel complexes.",
      priceMethod: "per_hour",
      basePrice: 50,
      unitPriceName: "Heure",
      unitPrice: 80.00, // 80 DH per hour
      isActive: true,
      options: [
        { id: "opt-2-1", name: "Formatage conditionnel & formules de calcul (+30 DH fixe)", price: 30.00 }
      ]
    },
    {
      id: "srv-3",
      name: "Conversion PDF vers Word/Excel avec OCR",
      category: "conversion",
      description: "Extraction de texte à partir de documents PDF ou scans non-éditables via un traitement OCR avancé et relecture.",
      priceMethod: "per_page",
      basePrice: 0,
      unitPriceName: "Page",
      unitPrice: 3.00,
      isActive: true,
      options: [
        { id: "opt-3-1", name: "Conservation stricte de la mise en page d'origine (+1 DH/Page)", price: 1.00 }
      ]
    },
    {
      id: "srv-4",
      name: "Mise en page Word de Mémoire/Livre",
      category: "mise_en_forme",
      description: "Mise aux normes académiques et éditoriales de rapports, mémoires ou livres (polices, marges, pagination, titres).",
      priceMethod: "per_page",
      basePrice: 50.00,
      unitPriceName: "Page",
      unitPrice: 1.50,
      isActive: true,
      options: [
        { id: "opt-4-1", name: "Pagination et gestion des en-têtes (+15 DH fixe)", price: 15.00 },
        { id: "opt-4-2", name: "Génération de sommaire dynamique (+10 DH fixe)", price: 10.00 }
      ]
    },
    {
      id: "srv-5",
      name: "Correction orthographique et relecture",
      category: "traitement",
      description: "Relecture approfondie pour correction de l'orthographe, de la syntaxe, de la grammaire et de la ponctuation.",
      priceMethod: "per_word",
      basePrice: 0,
      unitPriceName: "Mot",
      unitPrice: 0.05, // 0.05 DH per word
      isActive: true,
      options: []
    },
    {
      id: "srv-6",
      name: "Fusion, Découpage et Indexation PDF",
      category: "traitement",
      description: "Regroupement de several fichiers PDF, réorganisation de l'ordre des pages et création de signets d'indexation.",
      priceMethod: "fixed",
      basePrice: 50.00,
      unitPriceName: "Travail",
      unitPrice: 0,
      isActive: true,
      options: [
        { id: "opt-6-1", name: "Indexation et signets cliquables (+20 DH)", price: 20.00 }
      ]
    }
  ];

  const users: User[] = [
    {
      id: "usr-admin-1",
      name: "Administrateur Principal (Boguiman)",
      username: "boguiman",
      email: "boguiman@gmail.com",
      password: "admin123",
      role: "admin",
      phone: "+212 661-000001",
      city: "Casablanca",
      employeeCode: "DIR-001",
      jobTitle: "Directeur Général",
      department: "direction",
      contractType: "cdi",
      hireDate: "2024-01-01",
      cinNumber: "BK100200",
      cnssNumber: "123456789",
      ribNumber: "011780000012345678901234",
      bankName: "Attijariwafa Bank",
      baseSalary: 18000,
      vacationBalance: 22,
      active: true
    },
    {
      id: "usr-admin-2",
      name: "Administrateur (Nabil)",
      username: "nabil",
      email: "nabilniyo122@gmail.com",
      password: "admin123",
      role: "admin",
      phone: "+212 661-112233",
      city: "Casablanca",
      employeeCode: "DIR-002",
      jobTitle: "Directeur des Opérations",
      department: "direction",
      contractType: "cdi",
      hireDate: "2024-02-01",
      cinNumber: "BK200300",
      cnssNumber: "234567890",
      ribNumber: "011780000098765432109876",
      bankName: "Banque Populaire",
      baseSalary: 16000,
      vacationBalance: 20,
      active: true
    },
    {
      id: "usr-admin-3",
      name: "Administrateur Système",
      username: "admin",
      email: "admin@remix.ma",
      password: "admin123",
      role: "admin",
      phone: "+212 522-123456",
      city: "Casablanca",
      employeeCode: "ADM-001",
      jobTitle: "Administrateur Système & Sécurité",
      department: "administration",
      contractType: "cdi",
      hireDate: "2024-01-15",
      cinNumber: "BK300400",
      cnssNumber: "345678901",
      ribNumber: "011780000045612378945612",
      bankName: "BMCE Bank of Africa",
      baseSalary: 12000,
      vacationBalance: 18,
      active: true
    },
    {
      id: "usr-assistant-1",
      name: "Yassine Mansouri",
      username: "assistant",
      email: "assistant@digidocs.ma",
      password: "assistant123",
      role: "assistant",
      phone: "+212 661-998877",
      city: "Casablanca",
      employeeCode: "AST-001",
      jobTitle: "Assistante Administrative & Facturation",
      department: "administration",
      contractType: "cdi",
      hireDate: "2024-06-01",
      cinNumber: "BL456789",
      cnssNumber: "456789012",
      ribNumber: "011780000033221144556677",
      bankName: "Société Générale Maroc",
      baseSalary: 6500,
      vacationBalance: 15,
      emergencyContact: { name: "Fatima Mansouri", relation: "Mère", phone: "+212 661-001122" },
      active: true
    },
    {
      id: "usr-op-1",
      name: "Mehdi Tazi",
      username: "mehdi.tazi",
      email: "mehdi.op@digidocs.ma",
      password: "password123",
      role: "operator",
      phone: "+212 662-114477",
      city: "Casablanca",
      employeeCode: "EMP-001",
      jobTitle: "Opérateur de Saisie Senior",
      department: "production",
      contractType: "cdi",
      hireDate: "2024-03-01",
      cinNumber: "BE123987",
      cnssNumber: "567890123",
      ribNumber: "011780000077889944556611",
      bankName: "CIH Bank",
      baseSalary: 4500,
      hourlyRate: 35,
      pieceRate: 1.5,
      vacationBalance: 14,
      emergencyContact: { name: "Karim Tazi", relation: "Frère", phone: "+212 662-334455" },
      active: true
    },
    {
      id: "usr-op-2",
      name: "Salma Alami",
      username: "salma.alami",
      email: "salma.op@digidocs.ma",
      password: "password123",
      role: "operator",
      phone: "+212 663-887766",
      city: "Rabat",
      employeeCode: "EMP-002",
      jobTitle: "Opératrice PAO & Traitement OCR",
      department: "production",
      contractType: "cdd",
      hireDate: "2024-09-01",
      cinNumber: "BE987654",
      cnssNumber: "678901234",
      ribNumber: "011780000011223344556677",
      bankName: "Attijariwafa Bank",
      baseSalary: 4800,
      hourlyRate: 38,
      pieceRate: 1.8,
      vacationBalance: 12,
      emergencyContact: { name: "Omar Alami", relation: "Père", phone: "+212 663-112233" },
      active: true
    },
    {
      id: "usr-qa-1",
      name: "Karim Berrada",
      username: "karim.qa",
      email: "karim.qa@digidocs.ma",
      password: "password123",
      role: "qa",
      phone: "+212 664-556677",
      city: "Casablanca",
      employeeCode: "QA-001",
      jobTitle: "Responsable Contrôle Qualité & Relecture",
      department: "qualite",
      contractType: "cdi",
      hireDate: "2024-04-15",
      cinNumber: "BH776655",
      cnssNumber: "789012345",
      ribNumber: "011780000099887766554433",
      bankName: "Crédit du Maroc",
      baseSalary: 6000,
      vacationBalance: 16,
      emergencyContact: { name: "Nadia Berrada", relation: "Épouse", phone: "+212 664-998877" },
      active: true
    },
    {
      id: "usr-partner-1",
      name: "Imprimerie Al Amal SARL",
      username: "alamal",
      email: "contact@imprimerie-alamal.ma",
      password: "partner123",
      role: "partner",
      company: "Imprimerie Al Amal SARL",
      ice: "001234567890001",
      phone: "+212 522-889900",
      city: "Casablanca",
      address: "45 Rue Moulay Youssef, Casablanca",
      active: true
    },
    {
      id: "usr-client-1",
      name: "Dr. Tariq Benjelloun",
      username: "tariq.bj",
      email: "tariq.benjelloun@gmail.com",
      password: "client123",
      role: "client",
      customerType: "particular",
      phone: "+212 661-334455",
      city: "Rabat",
      address: "12 Avenue de France, Agdal, Rabat",
      clientNotes: "Auteur universitaire - Envoi régulier de manuscrits de thèses",
      active: true
    },
    {
      id: "usr-client-2",
      name: "Cabinet Juridique Maître Idrissi",
      username: "cab.idrissi",
      email: "contact@cabinet-idrissi.ma",
      password: "client123",
      role: "client",
      customerType: "company",
      company: "Cabinet Juridique Maître Idrissi",
      ice: "002987654320001",
      phone: "+212 537-778899",
      city: "Rabat",
      address: "8 Boulevard Hassan II, Rabat",
      clientNotes: "Numérisation et retranscription d'actes notariés et jugements",
      active: true
    }
  ];

  const partnerCustomers: PartnerCustomer[] = [
    {
      id: "pc-1",
      partnerId: "usr-partner-1",
      name: "Pr. Hassan Naciri",
      email: "hassan.naciri@univ-casa.ma",
      phone: "+212 661-445566",
      company: "Faculté des Sciences Ben M'sik",
      city: "Casablanca",
      address: "Bd Driss El Harti, Casablanca",
      notes: "Numérisation d'anciens manuels de chimie",
      createdAt: "2026-08-01T10:00:00Z"
    },
    {
      id: "pc-2",
      partnerId: "usr-partner-1",
      name: "Société Maghreb Import-Export",
      email: "compta@maghreb-import.ma",
      phone: "+212 522-334455",
      company: "Maghreb Import-Export",
      city: "Casablanca",
      address: "Zone Industrielle Ain Sebaa",
      notes: "Extraction de tableaux de factures douanières sous Excel",
      createdAt: "2026-08-05T14:30:00Z"
    }
  ];

  const payrolls: PayrollRecord[] = [
    {
      id: "pay-2026-08-001",
      reference: "PAY-2026-08-001",
      employeeId: "usr-op-1",
      employeeName: "Mehdi Tazi",
      employeeCode: "EMP-001",
      jobTitle: "Opérateur de Saisie Senior",
      department: "production",
      periodMonth: "2026-08",
      periodLabel: "Août 2026",
      contractType: "cdi",
      workedDays: 26,
      absentDays: 0,
      overtimeHours: 8,
      overtimeAmount: 350,
      baseSalary: 4500,
      productionBonus: 400,
      attendanceBonus: 200,
      seniorityBonus: 150,
      customBonus: 0,
      grossSalary: 5600,
      cnssDeduction: 250.88, // 4.48%
      amoDeduction: 126.56,  // 2.26%
      advanceDeduction: 0,
      absenceDeduction: 0,
      otherDeduction: 0,
      totalDeductions: 377.44,
      netSalary: 5222.56,
      netSalaryInWords: "Cinq mille deux cent vingt-deux Dirhams et cinquante-six centimes",
      paymentMethod: "transfer",
      paymentReference: "VIR-CIH-20260828",
      status: "paid",
      paidAt: "2026-08-28T16:00:00Z",
      notes: "Paiement mensuel validé par la direction",
      generatedBy: "Yassine Mansouri (Assistante RH)",
      createdAt: "2026-08-25T11:00:00Z"
    },
    {
      id: "pay-2026-08-002",
      reference: "PAY-2026-08-002",
      employeeId: "usr-op-2",
      employeeName: "Salma Alami",
      employeeCode: "EMP-002",
      jobTitle: "Opératrice PAO & Traitement OCR",
      department: "production",
      periodMonth: "2026-08",
      periodLabel: "Août 2026",
      contractType: "cdd",
      workedDays: 25,
      absentDays: 1,
      overtimeHours: 4,
      overtimeAmount: 180,
      baseSalary: 4800,
      productionBonus: 550,
      attendanceBonus: 150,
      seniorityBonus: 0,
      customBonus: 0,
      grossSalary: 5680,
      cnssDeduction: 254.46,
      amoDeduction: 128.37,
      advanceDeduction: 500, // Acompte déduit
      absenceDeduction: 184.60,
      otherDeduction: 0,
      totalDeductions: 1067.43,
      netSalary: 4612.57,
      netSalaryInWords: "Quatre mille six cent douze Dirhams et cinquante-sept centimes",
      paymentMethod: "transfer",
      paymentReference: "VIR-AWB-20260828",
      status: "paid",
      paidAt: "2026-08-28T16:00:00Z",
      notes: "Avance de 500 DH déduite",
      generatedBy: "Yassine Mansouri (Assistante RH)",
      createdAt: "2026-08-25T11:30:00Z"
    },
    {
      id: "pay-2026-08-003",
      reference: "PAY-2026-08-003",
      employeeId: "usr-qa-1",
      employeeName: "Karim Berrada",
      employeeCode: "QA-001",
      jobTitle: "Responsable Contrôle Qualité & Relecture",
      department: "qualite",
      periodMonth: "2026-08",
      periodLabel: "Août 2026",
      contractType: "cdi",
      workedDays: 26,
      absentDays: 0,
      overtimeHours: 6,
      overtimeAmount: 320,
      baseSalary: 6000,
      productionBonus: 300,
      attendanceBonus: 200,
      seniorityBonus: 200,
      customBonus: 0,
      grossSalary: 7020,
      cnssDeduction: 268.80, // Plafonné à 6000 DH
      amoDeduction: 158.65,
      advanceDeduction: 0,
      absenceDeduction: 0,
      otherDeduction: 0,
      totalDeductions: 427.45,
      netSalary: 6592.55,
      netSalaryInWords: "Six mille cinq cent quatre-vingt-douze Dirhams et cinquante-cinq centimes",
      paymentMethod: "transfer",
      paymentReference: "VIR-CDM-20260828",
      status: "paid",
      paidAt: "2026-08-28T16:00:00Z",
      notes: "Performance qualité 99.4% atteinte",
      generatedBy: "Yassine Mansouri (Assistante RH)",
      createdAt: "2026-08-25T12:00:00Z"
    },
    {
      id: "pay-2026-08-004",
      reference: "PAY-2026-08-004",
      employeeId: "usr-assistant-1",
      employeeName: "Yassine Mansouri",
      employeeCode: "AST-001",
      jobTitle: "Assistante Administrative & Facturation",
      department: "administration",
      periodMonth: "2026-08",
      periodLabel: "Août 2026",
      contractType: "cdi",
      workedDays: 26,
      absentDays: 0,
      overtimeHours: 0,
      overtimeAmount: 0,
      baseSalary: 6500,
      productionBonus: 0,
      attendanceBonus: 300,
      seniorityBonus: 100,
      customBonus: 200,
      grossSalary: 7100,
      cnssDeduction: 268.80,
      amoDeduction: 160.46,
      advanceDeduction: 0,
      absenceDeduction: 0,
      otherDeduction: 0,
      totalDeductions: 429.26,
      netSalary: 6670.74,
      netSalaryInWords: "Six mille six cent soixante-dix Dirhams et soixante-quatorze centimes",
      paymentMethod: "transfer",
      paymentReference: "VIR-SGMB-20260828",
      status: "paid",
      paidAt: "2026-08-28T16:00:00Z",
      notes: "Prime de gestion administrative incluse",
      generatedBy: "Administrateur Principal",
      createdAt: "2026-08-25T12:30:00Z"
    }
  ];

  const leaveRequests: LeaveRequest[] = [
    {
      id: "leave-001",
      employeeId: "usr-op-1",
      employeeName: "Mehdi Tazi",
      type: "paid_leave",
      startDate: "2026-09-10",
      endDate: "2026-09-14",
      daysCount: 4,
      reason: "Congés annuels d'été en famille",
      status: "approved",
      reviewedBy: "Administrateur Principal",
      reviewedAt: "2026-08-22T10:00:00Z",
      createdAt: "2026-08-20T09:00:00Z"
    },
    {
      id: "leave-002",
      employeeId: "usr-qa-1",
      employeeName: "Karim Berrada",
      type: "exceptional",
      startDate: "2026-09-01",
      endDate: "2026-09-02",
      daysCount: 2,
      reason: "Événement familial (mariage frère)",
      status: "pending",
      createdAt: "2026-08-27T15:00:00Z"
    }
  ];

  const salaryAdvances: SalaryAdvance[] = [
    {
      id: "adv-001",
      employeeId: "usr-op-2",
      employeeName: "Salma Alami",
      amount: 500,
      requestDate: "2026-08-10",
      reason: "Frais médicaux imprévus",
      status: "deducted",
      repaymentMonth: "2026-08",
      approvedBy: "Administrateur Principal",
      approvedAt: "2026-08-11T09:00:00Z"
    },
    {
      id: "adv-002",
      employeeId: "usr-op-1",
      employeeName: "Mehdi Tazi",
      amount: 800,
      requestDate: "2026-08-26",
      reason: "Rentrée scolaire enfants",
      status: "approved",
      repaymentMonth: "2026-09",
      approvedBy: "Administrateur Principal",
      approvedAt: "2026-08-27T11:00:00Z"
    }
  ];

  const demoOrders: Order[] = [
    {
      id: "ord-demo-101",
      reference: "CMD-2026-0801",
      serviceId: "srv-1",
      serviceName: "Saisie de manuscrit manuscrit vers Word",
      serviceCategory: "Saisie",
      description: "Saisie de manuscrit de 750 pages",
      quantity: 750,
      urgency: "normal",
      customerType: "particular",
      customerDetails: {
        name: "Dr. Tariq Benjelloun",
        email: "tariq.benjelloun@gmail.com",
        phone: "+212 661-334455",
        city: "Rabat",
        address: "12 Avenue de France, Agdal, Rabat"
      },
      files: [],
      messages: [],
      tasks: [],
      affiliateId: "usr-partner-1",
      affiliateCode: "AFF-AMAL2026",
      commissionRate: 10,
      status: "TRAVAIL_TERMINE",
      createdAt: "2026-08-01T10:00:00Z",
      updatedAt: "2026-08-06T15:00:00Z"
    },
    {
      id: "ord-demo-102",
      reference: "CMD-2026-0802",
      serviceId: "srv-3",
      serviceName: "Conversion PDF vers Word/Excel avec OCR",
      serviceCategory: "Conversion",
      description: "Conversion PDF OCR de 800 pages",
      quantity: 800,
      urgency: "fast",
      customerType: "company",
      customerDetails: {
        name: "Cabinet Juridique Maître Idrissi",
        email: "contact@cabinet-idrissi.ma",
        phone: "+212 537-778899",
        company: "Cabinet Juridique Maître Idrissi (ICE: 002987654320001)",
        city: "Rabat",
        address: "8 Boulevard Hassan II, Rabat"
      },
      files: [],
      messages: [],
      tasks: [],
      affiliateId: "usr-partner-1",
      affiliateCode: "AFF-AMAL2026",
      commissionRate: 10,
      status: "EN_TRAITEMENT",
      createdAt: "2026-08-10T09:00:00Z",
      updatedAt: "2026-08-12T11:00:00Z"
    },
    {
      id: "ord-demo-103",
      reference: "CMD-2026-0803",
      serviceId: "srv-4",
      serviceName: "Mise en page Word de Mémoire/Livre",
      serviceCategory: "Mise en page",
      description: "Mise en page de 400 pages",
      quantity: 400,
      urgency: "normal",
      customerType: "particular",
      customerDetails: {
        name: "Pr. Hassan Naciri",
        email: "hassan.naciri@univ-casa.ma",
        phone: "+212 661-445566",
        city: "Casablanca",
        address: "Bd Driss El Harti, Casablanca"
      },
      files: [],
      messages: [],
      tasks: [],
      affiliateId: "usr-partner-1",
      affiliateCode: "AFF-AMAL2026",
      commissionRate: 10,
      status: "TRAVAIL_TERMINE",
      createdAt: "2026-08-15T14:00:00Z",
      updatedAt: "2026-08-18T16:30:00Z"
    }
  ];

  const demoQuotes: Quote[] = [
    {
      id: "qte-101",
      reference: "DEV-2026-0801",
      orderId: "ord-demo-101",
      basePrice: 1875,
      optionsPrice: 0,
      urgencySurcharge: 0,
      printingPrice: 0,
      deliveryPrice: 0,
      totalAmount: 2250,
      depositPercent: 50,
      depositAmount: 937.5,
      balanceAmount: 1125,
      status: "accepted",
      validityDate: "2026-09-01",
      items: []
    },
    {
      id: "qte-102",
      reference: "DEV-2026-0802",
      orderId: "ord-demo-102",
      basePrice: 3200,
      optionsPrice: 960,
      urgencySurcharge: 0,
      printingPrice: 0,
      deliveryPrice: 0,
      totalAmount: 4992,
      depositPercent: 60,
      depositAmount: 2496,
      balanceAmount: 1996.8,
      status: "accepted",
      validityDate: "2026-09-01",
      items: []
    },
    {
      id: "qte-103",
      reference: "DEV-2026-0803",
      orderId: "ord-demo-103",
      basePrice: 675,
      optionsPrice: 0,
      urgencySurcharge: 0,
      printingPrice: 0,
      deliveryPrice: 0,
      totalAmount: 810,
      depositPercent: 50,
      depositAmount: 405,
      balanceAmount: 405,
      status: "accepted",
      validityDate: "2026-09-01",
      items: []
    }
  ];

  const demoPayments: Payment[] = [
    {
      id: "pay-001",
      reference: "REG-2026-001",
      orderId: "ord-demo-101",
      orderReference: "CMD-2026-0801",
      amount: 2250,
      paymentMethod: "transfer",
      method: "transfer",
      proofUrl: "",
      status: "verified",
      paymentDate: "2026-08-02T14:00:00Z",
      verifiedAt: "2026-08-02T15:00:00Z",
      notes: "Règlement intégral par virement Attijariwafa Bank"
    },
    {
      id: "pay-002",
      reference: "REG-2026-002",
      orderId: "ord-demo-102",
      orderReference: "CMD-2026-0802",
      amount: 2496,
      paymentMethod: "transfer",
      method: "transfer",
      proofUrl: "",
      status: "verified",
      paymentDate: "2026-08-11T10:30:00Z",
      verifiedAt: "2026-08-11T11:00:00Z",
      notes: "Acompte 60% reçu par virement bancaire"
    },
    {
      id: "pay-003",
      reference: "REG-2026-003",
      orderId: "ord-demo-103",
      orderReference: "CMD-2026-0803",
      amount: 810,
      paymentMethod: "online",
      method: "online",
      proofUrl: "",
      status: "verified",
      paymentDate: "2026-08-16T09:15:00Z",
      verifiedAt: "2026-08-16T09:20:00Z",
      notes: "Paiement en ligne par carte bancaire CMI"
    }
  ];

  const demoCommissions: AffiliateCommission[] = [
    {
      id: "comm-001",
      reference: "COM-2026-001",
      affiliateId: "usr-partner-1",
      affiliateName: "Imprimerie Al Amal SARL",
      affiliateCode: "AFF-AMAL2026",
      clientId: "usr-client-1",
      clientName: "Dr. Tariq Benjelloun",
      orderId: "ord-demo-101",
      orderReference: "CMD-2026-0801",
      serviceName: "Saisie de manuscrit manuscrit vers Word",
      paymentId: "pay-001",
      paymentReference: "REG-2026-001",
      orderTotalAmount: 2250,
      paidAmount: 2250,
      paymentAmount: 2250,
      commissionRate: 10,
      commissionAmount: 225,
      status: "validated",
      createdAt: "2026-08-02T15:00:00Z",
      validatedAt: "2026-08-02T15:00:00Z",
      notes: "Commission 10% calculée automatiquement sur le paiement REG-2026-001 (2250.00 DH)"
    },
    {
      id: "comm-002",
      reference: "COM-2026-002",
      affiliateId: "usr-partner-1",
      affiliateName: "Imprimerie Al Amal SARL",
      affiliateCode: "AFF-AMAL2026",
      clientId: "usr-client-2",
      clientName: "Cabinet Juridique Maître Idrissi",
      orderId: "ord-demo-102",
      orderReference: "CMD-2026-0802",
      serviceName: "Conversion PDF vers Word/Excel avec OCR",
      paymentId: "pay-002",
      paymentReference: "REG-2026-002",
      orderTotalAmount: 4992,
      paidAmount: 2496,
      paymentAmount: 2496,
      commissionRate: 10,
      commissionAmount: 249.6,
      status: "validated",
      createdAt: "2026-08-11T11:00:00Z",
      validatedAt: "2026-08-11T11:00:00Z",
      notes: "Commission 10% sur acompte REG-2026-002 (2496.00 DH)"
    },
    {
      id: "comm-003",
      reference: "COM-2026-003",
      affiliateId: "usr-partner-1",
      affiliateName: "Imprimerie Al Amal SARL",
      affiliateCode: "AFF-AMAL2026",
      clientId: "pc-1",
      clientName: "Pr. Hassan Naciri",
      orderId: "ord-demo-103",
      orderReference: "CMD-2026-0803",
      serviceName: "Mise en page Word de Mémoire/Livre",
      paymentId: "pay-003",
      paymentReference: "REG-2026-003",
      orderTotalAmount: 810,
      paidAmount: 810,
      paymentAmount: 810,
      commissionRate: 10,
      commissionAmount: 81,
      status: "pending",
      createdAt: "2026-08-16T09:20:00Z",
      notes: "Commission 10% en attente de validation administrative"
    }
  ];

  return {
    users,
    partners: users.filter(u => u.role === 'partner'),
    partnerCustomers,
    services,
    orders: demoOrders,
    quotes: demoQuotes,
    invoices: [],
    payments: demoPayments,
    auditLogs: [],
    notifications: [],
    payrolls,
    leaveRequests,
    salaryAdvances,
    affiliateCommissions: demoCommissions,
    settings: defaultSettings
  };
}
