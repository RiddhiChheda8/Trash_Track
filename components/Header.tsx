// @ts-nocheck
'use client'
import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Menu, Coins, Leaf, Search, Bell, User, ChevronDown, LogIn, LogOut, CheckCircle, Gift, AlertCircle, X } from "lucide-react"
import { Web3Auth } from "@web3auth/modal"
import { CHAIN_NAMESPACES, IProvider, WEB3AUTH_NETWORK } from "@web3auth/base"
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { createUser, getUnreadNotifications, markNotificationAsRead, getUserByEmail, getUserBalance } from "@/utils/db/actions"

const clientId = "BFZJ1wckpZfAfJnoHLv6Ij8d-CFgRC8ERpEwsrCdSKlynlFZfR_7jYZMYKz5sLdhBj_YE6I4VW49F2Plk8OvB_U";

const ANKR_API_KEY = "8034f7057cb7aab522579f6b871e1c83a5008b9afa6f5f0e64e10c572fe2d80e";

const chainConfig = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainId: "0xaa36a7",
  rpcTarget: `https://rpc.ankr.com/eth_sepolia/8034f7057cb7aab522579f6b871e1c83a5008b9afa6f5f0e64e10c572fe2d80e`,
  displayName: "Ethereum Sepolia Testnet",
  blockExplorerUrl: "https://sepolia.etherscan.io",
  ticker: "ETH",
  tickerName: "Ethereum",
  logo: "https://cryptologos.cc/logos/ethereum-eth-logo.png",
};

const privateKeyProvider = new EthereumPrivateKeyProvider({
  config: { 
    chainConfig: {
      chainNamespace: CHAIN_NAMESPACES.EIP155,
      chainId: "0xaa36a7",
      rpcTarget: `https://rpc.ankr.com/eth_sepolia/8034f7057cb7aab522579f6b871e1c83a5008b9afa6f5f0e64e10c572fe2d80e`,
      displayName: "Ethereum Sepolia Testnet",
      blockExplorerUrl: "https://sepolia.etherscan.io",
      ticker: "ETH",
      tickerName: "Ethereum",
    }
  }
});

interface HeaderProps {
  onMenuClick: () => void;
  totalEarnings: number;
}

interface Notification {
  id: number;
  userId: number;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
}

export default function Header({ onMenuClick, totalEarnings }: HeaderProps) {
  const [provider, setProvider] = useState<IProvider | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [web3AuthInstance, setWeb3AuthInstance] = useState<Web3Auth | null>(null);
  const [web3AuthInitialized, setWeb3AuthInitialized] = useState(false);
  const pathname = usePathname()
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [balance, setBalance] = useState(0)
  const initStartedRef = useRef(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initWeb3Auth = async () => {
      if (initStartedRef.current) return;
      initStartedRef.current = true;

      try {
        const web3auth = new Web3Auth({
          clientId,
          web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
          chainConfig,
          privateKeyProvider,
          uiConfig: {
            theme: "light",
            loginMethodsOrder: ["google", "facebook", "twitter"],
            appName: "TrashTrack",
            defaultLanguage: "en",
          },
        });

        await web3auth.initModal();
        setWeb3AuthInstance(web3auth);
        setWeb3AuthInitialized(true);

        if (web3auth.connected) {
          setLoggedIn(true);
          const user = await web3auth.getUserInfo();
          setUserInfo(user);
          if (user.email) {
            localStorage.setItem('userEmail', user.email);
            try {
              await createUser(user.email, user.name || 'Anonymous User');
            } catch (error) {
              console.error("Error creating user:", error);
            }
          }
        }
      } catch (error) {
        console.error("Error initializing Web3Auth:", error);
        setWeb3AuthInitialized(true);
      } finally {
        setLoading(false);
      }
    };

    initWeb3Auth();
  }, []);

  // Close notifications when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch notifications when user info changes
  useEffect(() => {
    const fetchNotifications = async () => {
      if (userInfo && userInfo.email) {
        try {
          const user = await getUserByEmail(userInfo.email);
          if (user) {
            const unreadNotifications = await getUnreadNotifications(user.id);
            const mappedNotifications: Notification[] = unreadNotifications.map((n: any) => ({
              id: n.id,
              userId: n.userId,
              type: n.type || 'reward',
              message: n.message || 'New notification',
              isRead: n.isRead || false,
              createdAt: n.createdAt ? new Date(n.createdAt) : new Date()
            }));
            setNotifications(mappedNotifications);
          }
        } catch (error) {
          console.error("Error fetching notifications:", error);
        }
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 5000);
    return () => clearInterval(interval);
  }, [userInfo]);

  // Fetch user balance
  useEffect(() => {
    const fetchUserBalance = async () => {
      if (userInfo && userInfo.email) {
        try {
          const user = await getUserByEmail(userInfo.email);
          if (user) {
            const userBalance = await getUserBalance(user.id);
            setBalance(userBalance);
          }
        } catch (error) {
          console.error("Error fetching user balance:", error);
        }
      }
    };

    fetchUserBalance();
  }, [userInfo]);

  // Listen for balance updates
  useEffect(() => {
    const handleBalanceUpdate = (event: CustomEvent<number>) => {
      setBalance(event.detail);
    };

    window.addEventListener('balanceUpdated', handleBalanceUpdate as EventListener);
    return () => {
      window.removeEventListener('balanceUpdated', handleBalanceUpdate as EventListener);
    };
  }, []);

  const login = async () => {
    if (!web3AuthInstance) {
      alert("Web3Auth is still initializing. Please wait a moment and try again.");
      return;
    }

    try {
      const web3authProvider = await web3AuthInstance.connect();
      if (web3authProvider) {
        setProvider(web3authProvider);
        setLoggedIn(true);
        const user = await web3AuthInstance.getUserInfo();
        setUserInfo(user);
        if (user.email) {
          localStorage.setItem('userEmail', user.email);
          try {
            await createUser(user.email, user.name || 'Anonymous User');
            const createdUser = await getUserByEmail(user.email);
            if (createdUser) {
              const userBalance = await getUserBalance(createdUser.id);
              setBalance(userBalance);
              localStorage.setItem('userBalance', userBalance.toString());
            }
          } catch (error) {
            console.error("Error creating user:", error);
          }
        }
      }
    } catch (error) {
      console.error("Error during login:", error);
      alert("Login failed: " + (error.message || "Unknown error"));
    }
  };

  const logout = async () => {
    if (!web3AuthInstance) return;
    try {
      await web3AuthInstance.logout();
      setProvider(null);
      setLoggedIn(false);
      setUserInfo(null);
      setBalance(0);
      setNotifications([]);
      localStorage.removeItem('userEmail');
      localStorage.removeItem('userBalance');
      window.location.reload();
    } catch (error) {
      console.error("Error during logout:", error);
    }
  };

  // Handle notification click
  const handleNotificationClick = async (notificationId: number) => {
    try {
      await markNotificationAsRead(notificationId);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  // Mark all notifications as read
  const handleMarkAllAsRead = async () => {
    if (!userInfo?.email) return;
    try {
      const user = await getUserByEmail(userInfo.email);
      if (user) {
        for (const notification of notifications) {
          await markNotificationAsRead(notification.id);
        }
        setNotifications([]);
      }
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
    }
  };

  // Get icon based on notification type
  const getNotificationIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'reward':
        return <Gift className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-yellow-500 mr-2 flex-shrink-0" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />;
      default:
        return <Bell className="h-4 w-4 text-blue-500 mr-2 flex-shrink-0" />;
    }
  };

  // Format notification time
  const formatTime = (date: Date) => {
    if (!date) return 'Recently';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (loading) {
    return (
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="mr-2 md:mr-4" onClick={onMenuClick}>
              <Menu className="h-6 w-6" />
            </Button>
            <div className="flex items-center">
              <Leaf className="h-6 w-6 md:h-8 md:w-8 text-green-500 mr-1 md:mr-2" />
              <div className="flex flex-col">
                <span className="font-bold text-base md:text-lg text-gray-800">TrashTrack</span>
              </div>
            </div>
          </div>
          <div className="animate-pulse bg-gray-200 h-8 w-24 rounded"></div>
        </div>
      </header>
    );
  }

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center">
          <Button variant="ghost" size="icon" className="mr-2 md:mr-4" onClick={onMenuClick}>
            <Menu className="h-6 w-6" />
          </Button>
          <Link href="/" className="flex items-center">
            <Leaf className="h-6 w-6 md:h-8 md:w-8 text-green-500 mr-1 md:mr-2" />
            <div className="flex flex-col">
              <span className="font-bold text-base md:text-lg text-gray-800">TrashTrack</span>
            </div>
          </Link>
        </div>
        {!isMobile && (
          <div className="flex-1 max-w-xl mx-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Search..."
                className="w-full px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            </div>
          </div>
        )}
        <div className="flex items-center">
          {isMobile && (
            <Button variant="ghost" size="icon" className="mr-2">
              <Search className="h-5 w-5" />
            </Button>
          )}
          
          {/* NOTIFICATIONS DROPDOWN */}
          <div className="relative mr-2" ref={notificationRef}>
            <Button 
              variant="ghost" 
              size="icon" 
              className="relative hover:bg-gray-100 rounded-full"
              onClick={() => setShowNotifications(!showNotifications)}
            >
              <Bell className="h-5 w-5" />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {notifications.length}
                </span>
              )}
            </Button>
            
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-96 overflow-y-auto">
                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b">
                  <h3 className="font-semibold text-gray-900">Notifications</h3>
                  <div className="flex items-center gap-2">
                    {notifications.length > 0 && (
                      <button
                        onClick={handleMarkAllAsRead}
                        className="text-xs text-blue-500 hover:text-blue-700 font-medium"
                      >
                        Mark all read
                      </button>
                    )}
                    <button
                      onClick={() => setShowNotifications(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                
                {/* Notifications List */}
                <div className="py-1">
                  {notifications.length > 0 ? (
                    notifications.map((notification) => (
                      <div 
                        key={notification.id}
                        className="flex items-start p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                        onClick={() => handleNotificationClick(notification.id)}
                      >
                        <div className="flex items-start w-full">
                          {getNotificationIcon(notification.type)}
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start mb-1">
                              <span className="text-sm font-medium text-gray-900 capitalize">
                                {notification.type}
                              </span>
                              <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                                {formatTime(notification.createdAt)}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 break-words">
                              {notification.message}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-8 px-4 text-center">
                      <Bell className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 font-medium">No new notifications</p>
                      <p className="text-sm text-gray-400 mt-1">All caught up!</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          {/* BALANCE DISPLAY */}
          <div className="mr-2 md:mr-4 flex items-center bg-gray-100 rounded-full px-2 md:px-3 py-1">
            <Coins className="h-4 w-4 md:h-5 md:w-5 mr-1 text-green-500" />
            <span className="font-semibold text-sm md:text-base text-gray-800">
              {balance.toFixed(2)}
            </span>
          </div>
          
          {/* LOGIN/LOGOUT BUTTONS - SEPARATED */}
          {!loggedIn ? (
            // LOGIN BUTTON (when not logged in)
            <Button 
              onClick={login} 
              disabled={!web3AuthInitialized}
              className="bg-green-600 hover:bg-green-700 text-white text-sm md:text-base"
            >
              <LogIn className="mr-2 h-4 w-4" />
              {!web3AuthInitialized ? "Initializing..." : "Login"}
            </Button>
          ) : (
            // USER PROFILE DROPDOWN (when logged in)
            <div className="flex items-center gap-2">
              {/* User info display */}
              <div className="hidden md:flex items-center space-x-1 px-3 py-1 rounded-full border border-gray-300 bg-white">
                <User className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700 max-w-[120px] truncate">
                  {userInfo?.name || userInfo?.email?.split('@')[0] || "User"}
                </span>
              </div>
              
              {/* Logout button - SEPARATE */}
              <Button 
                onClick={logout} 
                variant="outline" 
                className="text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700 text-sm"
              >
                <LogOut className="h-4 w-4 mr-1" />
                Logout
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}