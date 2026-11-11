import React from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core"
import * as solid from "@fortawesome/free-solid-svg-icons"

export interface LucideProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string
  color?: string
  strokeWidth?: number | string
}

export type LucideIcon = React.ForwardRefExoticComponent<LucideProps & React.RefAttributes<SVGSVGElement>>

function createFaComponent(iconDef: IconDefinition): LucideIcon {
  const Component = React.forwardRef<SVGSVGElement, LucideProps>(function FaIcon({ size, className, style, ...props }, ref) {
    const customStyle: React.CSSProperties = { ...style }
    if (size) {
      customStyle.width = typeof size === "number" ? `${size}px` : size
      customStyle.height = typeof size === "number" ? `${size}px` : size
    }
    return (
      <FontAwesomeIcon
        ref={ref as never}
        icon={iconDef}
        className={className}
        style={customStyle}
        {...(props as any)}
      />
    )
  })
  Component.displayName = `FA(${iconDef.iconName})`
  return Component
}

export const Activity = createFaComponent(solid.faChartLine)
export const AlertCircle = createFaComponent(solid.faCircleExclamation)
export const AlertTriangle = createFaComponent(solid.faTriangleExclamation)
export const ArrowDown = createFaComponent(solid.faArrowDown)
export const ArrowLeft = createFaComponent(solid.faArrowLeft)
export const ArrowLeftRight = createFaComponent(solid.faRightLeft)
export const ArrowRight = createFaComponent(solid.faArrowRight)
export const ArrowUp = createFaComponent(solid.faArrowUp)
export const ArrowUpDown = createFaComponent(solid.faSort)
export const ArrowUpRight = createFaComponent(solid.faArrowUpRightFromSquare)
export const BadgeCheck = createFaComponent(solid.faCircleCheck)
export const BadgeDollarSign = createFaComponent(solid.faCertificate)
export const Ban = createFaComponent(solid.faBan)
export const Banknote = createFaComponent(solid.faMoneyBill)
export const BarChart3 = createFaComponent(solid.faChartSimple)
export const Bell = createFaComponent(solid.faBell)
export const BookCheck = createFaComponent(solid.faBookBookmark)
export const BookOpen = createFaComponent(solid.faBookOpen)
export const BookOpenCheck = createFaComponent(solid.faBookOpenReader)
export const Boxes = createFaComponent(solid.faBoxesStacked)
export const Briefcase = createFaComponent(solid.faBriefcase)
export const Building2 = createFaComponent(solid.faBuilding)
export const Calculator = createFaComponent(solid.faCalculator)
export const Calendar = createFaComponent(solid.faCalendar)
export const CalendarCheck = createFaComponent(solid.faCalendarCheck)
export const CalendarDays = createFaComponent(solid.faCalendarDays)
export const CalendarIcon = createFaComponent(solid.faCalendar)
export const Camera = createFaComponent(solid.faCamera)
export const Car = createFaComponent(solid.faCar)
export const Check = createFaComponent(solid.faCheck)
export const CheckCircle = createFaComponent(solid.faCircleCheck)
export const CheckCircle2 = createFaComponent(solid.faCircleCheck)
export const CheckIcon = createFaComponent(solid.faCheck)
export const ChevronDown = createFaComponent(solid.faChevronDown)
export const ChevronDownIcon = createFaComponent(solid.faChevronDown)
export const ChevronLeft = createFaComponent(solid.faChevronLeft)
export const ChevronRight = createFaComponent(solid.faChevronRight)
export const ChevronRightIcon = createFaComponent(solid.faChevronRight)
export const ChevronUp = createFaComponent(solid.faChevronUp)
export const ChevronUpIcon = createFaComponent(solid.faChevronUp)
export const ChevronsLeft = createFaComponent(solid.faAnglesLeft)
export const ChevronsRight = createFaComponent(solid.faAnglesRight)
export const ChevronsUpDown = createFaComponent(solid.faUpDown)
export const Phone = createFaComponent(solid.faPhone)
export const Envelope = createFaComponent(solid.faEnvelope)
export const IdCard = createFaComponent(solid.faIdCard)
export const CircleCheckIcon = createFaComponent(solid.faCircleCheck)
export const CircleDollarSign = createFaComponent(solid.faCircleDollarToSlot)
export const CircleIcon = createFaComponent(solid.faCircle)
export const ClipboardCheck = createFaComponent(solid.faClipboardCheck)
export const ClipboardList = createFaComponent(solid.faClipboardList)
export const Clock = createFaComponent(solid.faClock)
export const Cloud = createFaComponent(solid.faCloud)
export const Cog = createFaComponent(solid.faGear)
export const Coins = createFaComponent(solid.faCoins)
export const Columns3 = createFaComponent(solid.faTableColumns)
export const CreditCard = createFaComponent(solid.faCreditCard)
export const Database = createFaComponent(solid.faDatabase)
export const DatabaseBackup = createFaComponent(solid.faDatabase)
export const DollarSign = createFaComponent(solid.faBagShopping)
export const Download = createFaComponent(solid.faDownload)
export const Edit3 = createFaComponent(solid.faPenToSquare)
export const ExternalLink = createFaComponent(solid.faArrowUpRightFromSquare)
export const Eye = createFaComponent(solid.faEye)
export const Factory = createFaComponent(solid.faIndustry)
export const FileCheck = createFaComponent(solid.faFileCircleCheck)
export const FileCheck2 = createFaComponent(solid.faFileCircleCheck)
export const FileDown = createFaComponent(solid.faFileArrowDown)
export const FilePenLine = createFaComponent(solid.faFilePen)
export const FilePlus = createFaComponent(solid.faFileCirclePlus)
export const FileSpreadsheet = createFaComponent(solid.faFileExcel)
export const FileText = createFaComponent(solid.faFileLines)
export const Filter = createFaComponent(solid.faFilter)
export const Flag = createFaComponent(solid.faFlag)
export const FolderKanban = createFaComponent(solid.faFolderTree)
export const GalleryVerticalEnd = createFaComponent(solid.faImages)
export const Gavel = createFaComponent(solid.faGavel)
export const Gift = createFaComponent(solid.faGift)
export const GitBranch = createFaComponent(solid.faCodeBranch)
export const Globe = createFaComponent(solid.faGlobe)
export const Grid3X3 = createFaComponent(solid.faTableCells)
export const GripVertical = createFaComponent(solid.faGripVertical)
export const Hammer = createFaComponent(solid.faHammer)
export const HandCoins = createFaComponent(solid.faHandHoldingDollar)
export const Handshake = createFaComponent(solid.faHandshake)
export const HardDrive = createFaComponent(solid.faHardDrive)
export const Hash = createFaComponent(solid.faHashtag)
export const Home = createFaComponent(solid.faHouse)
export const Info = createFaComponent(solid.faCircleInfo)
export const InfoIcon = createFaComponent(solid.faCircleInfo)
export const Landmark = createFaComponent(solid.faBuildingColumns)
export const Layers = createFaComponent(solid.faLayerGroup)
export const LayoutDashboard = createFaComponent(solid.faTableCellsLarge)
export const ListChecks = createFaComponent(solid.faListCheck)
export const ListOrdered = createFaComponent(solid.faListOl)
export const ListTodo = createFaComponent(solid.faListCheck)
export const Loader2 = createFaComponent(solid.faSpinner)
export const Loader2Icon = createFaComponent(solid.faSpinner)
export const Lock = createFaComponent(solid.faLock)
export const LockKeyhole = createFaComponent(solid.faLock)
export const LockOpen = createFaComponent(solid.faLockOpen)
export const LogOut = createFaComponent(solid.faRightFromBracket)
export const Mail = createFaComponent(solid.faEnvelope)
export const MapPin = createFaComponent(solid.faLocationDot)
export const MessageCircle = createFaComponent(solid.faComment)
export const MessageSquare = createFaComponent(solid.faCommentDots)
export const Monitor = createFaComponent(solid.faDesktop)
export const Moon = createFaComponent(solid.faMoon)
export const MoreHorizontal = createFaComponent(solid.faEllipsis)
export const MoreVertical = createFaComponent(solid.faEllipsisVertical)
export const OctagonXIcon = createFaComponent(solid.faCircleXmark)
export const Package = createFaComponent(solid.faBox)
export const PackageCheck = createFaComponent(solid.faBoxOpen)
export const PackageMinus = createFaComponent(solid.faBoxArchive)
export const Paperclip = createFaComponent(solid.faPaperclip)
export const Palmtree = createFaComponent(solid.faTree)
export const PanelLeftIcon = createFaComponent(solid.faBars)
export const Pencil = createFaComponent(solid.faPen)
export const Percent = createFaComponent(solid.faPercent)
export const PiggyBank = createFaComponent(solid.faPiggyBank)
export const Play = createFaComponent(solid.faPlay)
export const Plus = createFaComponent(solid.faPlus)
export const Printer = createFaComponent(solid.faPrint)
export const Receipt = createFaComponent(solid.faReceipt)
export const ReceiptText = createFaComponent(solid.faReceipt)
export const Repeat = createFaComponent(solid.faRepeat)
export const RotateCcw = createFaComponent(solid.faRotateLeft)
export const Scale = createFaComponent(solid.faScaleBalanced)
export const ScanBarcode = createFaComponent(solid.faBarcode)
export const ScanLine = createFaComponent(solid.faBarcode)
export const Search = createFaComponent(solid.faMagnifyingGlass)
export const SearchIcon = createFaComponent(solid.faMagnifyingGlass)
export const Send = createFaComponent(solid.faPaperPlane)
export const Settings = createFaComponent(solid.faGear)
export const Settings2 = createFaComponent(solid.faSliders)
export const Shield = createFaComponent(solid.faShield)
export const ShieldAlert = createFaComponent(solid.faShieldHalved)
export const ShieldCheck = createFaComponent(solid.faShieldHalved)
export const ShieldQuestion = createFaComponent(solid.faShieldHalved)
export const ShoppingBag = createFaComponent(solid.faBagShopping)
export const ShoppingCart = createFaComponent(solid.faCartShopping)
export const SkipForward = createFaComponent(solid.faForwardStep)
export const SlidersHorizontal = createFaComponent(solid.faSliders)
export const Sparkles = createFaComponent(solid.faWandMagicSparkles)
export const Star = createFaComponent(solid.faStar)
export const Sun = createFaComponent(solid.faSun)
export const Tag = createFaComponent(solid.faTag)
export const Target = createFaComponent(solid.faBullseye)
export const Ticket = createFaComponent(solid.faTicket)
export const Timer = createFaComponent(solid.faStopwatch)
export const Trash2 = createFaComponent(solid.faTrashCan)
export const TrendingDown = createFaComponent(solid.faArrowTrendDown)
export const TrendingUp = createFaComponent(solid.faArrowTrendUp)
export const TriangleAlert = createFaComponent(solid.faTriangleExclamation)
export const TriangleAlertIcon = createFaComponent(solid.faTriangleExclamation)
export const Truck = createFaComponent(solid.faTruck)
export const Undo2 = createFaComponent(solid.faArrowRotateLeft)
export const Upload = createFaComponent(solid.faUpload)
export const User = createFaComponent(solid.faUser)
export const UserCheck = createFaComponent(solid.faUserCheck)
export const UserCircle = createFaComponent(solid.faCircleUser)
export const UserPlus = createFaComponent(solid.faUserPlus)
export const Users = createFaComponent(solid.faUsers)
export const Wallet = createFaComponent(solid.faWallet)
export const Workflow = createFaComponent(solid.faDiagramProject)
export const Wrench = createFaComponent(solid.faWrench)
export const X = createFaComponent(solid.faXmark)
export const XCircle = createFaComponent(solid.faCircleXmark)
export const TableList = createFaComponent(solid.faTableList)
const faWhatsappDef: IconDefinition = {
  prefix: "fab",
  iconName: "whatsapp" as never,
  icon: [
    448,
    512,
    [],
    "f232",
    "M380.9 97.1c-41.9-42-97.7-65.1-157-65.1-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480 117.7 449.1c32.4 17.7 68.9 27 106.1 27l.1 0c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3 18.6-68.1-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1s56.2 81.2 56.1 130.5c0 101.8-84.9 184.6-186.6 184.6zM325.1 300.5c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8s-14.3 18-17.6 21.8c-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7 .9-6.9-.5-9.7s-12.5-30.1-17.1-41.2c-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2s-9.7 1.4-14.8 6.9c-5.1 5.6-19.4 19-19.4 46.3s19.9 53.7 22.6 57.4c2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4s4.6-24.1 3.2-26.4c-1.3-2.5-5-3.9-10.5-6.6z",
  ],
}

export const BoxArchive = createFaComponent(solid.faBoxArchive)
export const Whatsapp = createFaComponent(faWhatsappDef)
export const XIcon = createFaComponent(solid.faXmark)

// Default fallback for any unlisted Lucide icon
export const createLucideIcon = (iconName: string, iconNode: any) => createFaComponent(solid.faIcons)