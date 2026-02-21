import React from 'react';
import {
  LayoutDashboard, Users, Settings, Calendar, CalendarDays, ClipboardCheck, Clock, Package, Boxes,
  CircleDollarSign, FileText, LogOut, ChevronDown, ChevronRight, Menu, X,
  UserPlus, Truck, Briefcase, Send, History, CheckCircle, PackagePlus,
  PackageMinus, TrendingUp, TrendingDown, BarChart3, FileText as FileTextLucide,
  Skull, Building2, Bird, Warehouse, Wallet, UserRound, ReceiptText,
  UserCog, KeyRound, Lock, AlertTriangle, ArrowDownCircle, ArrowUpCircle,
  UtensilsCrossed
} from 'lucide-react';

interface IconProps {
  className?: string;
}

export const DashboardIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <LayoutDashboard className={className} />;
export const UsersIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <Users className={className} />;
export const SettingsIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <Settings className={className} />;
export const CalendarIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <Calendar className={className} />;
export const CalendarDaysIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <CalendarDays className={className} />;
export const ClipboardIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <ClipboardCheck className={className} />;
export const ClockIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <Clock className={className} />;
export const BoxIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <Package className={className} />;
export const BoxesIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <Boxes className={className} />;
export const CurrencyIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <CircleDollarSign className={className} />;
export const WalletIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <Wallet className={className} />;
export const DocumentIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <FileText className={className} />;
export const LogoutIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <LogOut className={className} />;
export const ChevronDownIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <ChevronDown className={className} />;
export const ChevronRightIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <ChevronRight className={className} />;
export const MenuIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <Menu className={className} />;
export const CloseIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <X className={className} />;
export const UserPlusIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <UserPlus className={className} />;
export const TruckIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <Truck className={className} />;
export const BriefcaseIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <Briefcase className={className} />;
export const PaperAirplaneIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <Send className={className} />;
export const HistoryIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <History className={className} />;
export const CheckCircleIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <CheckCircle className={className} />;
export const InboxInIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <PackagePlus className={className} />;
export const InboxOutIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <PackageMinus className={className} />;
export const ArrowDownCircleIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <ArrowDownCircle className={className} />;
export const ArrowUpCircleIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <ArrowUpCircle className={className} />;
export const TrendingUpIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <TrendingUp className={className} />;
export const TrendingDownIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <TrendingDown className={className} />;
export const ChartIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <BarChart3 className={className} />;
export const FileTextIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <FileTextLucide className={className} />;
export const SkullIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <Skull className={className} />;
export const AlertTriangleIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <AlertTriangle className={className} />;
export const OfficeBuildingIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <Building2 className={className} />;
export const ChickenIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <Bird className={className} />;
export const WarehouseIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <Warehouse className={className} />;
export const UserRoundIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <UserRound className={className} />;
export const ReceiptTextIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <ReceiptText className={className} />;
export const UserCogIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <UserCog className={className} />;
export const KeyRoundIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <KeyRound className={className} />;
export const LockIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <Lock className={className} />;
export const UtensilsCrossedIcon: React.FC<IconProps> = ({ className = 'w-5 h-5' }) => <UtensilsCrossed className={className} />;
