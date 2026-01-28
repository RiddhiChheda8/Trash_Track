'use client'
import { useState, useEffect } from 'react'
import { Coins, Gift, Loader, ArrowUp, ArrowDown, History, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getUserByEmail, getRewardTransactions, getAvailableRewards, redeemReward, createTransaction, getUserBalance } from '@/utils/db/actions'
import { toast } from 'react-hot-toast'

type Transaction = {
  id: number
  type: 'earned' | 'redeemed'
  amount: number
  description: string
  date: string
}

type RewardItem = {
  id: number
  name: string
  cost: number
  description: string | null
  collectionInfo: string
}

export default function RewardsPage() {
  const [user, setUser] = useState<{ id: number; email: string; name: string } | null>(null)
  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [rewards, setRewards] = useState<RewardItem[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch user data and rewards
  const fetchUserData = async () => {
    try {
      const userEmail = localStorage.getItem('userEmail')
      if (!userEmail) {
        toast.error('Please log in to view rewards')
        return
      }

      const fetchedUser = await getUserByEmail(userEmail)
      if (!fetchedUser) {
        toast.error('User not found')
        return
      }

      setUser(fetchedUser)

      // Fetch all data in parallel for better performance
      const [userTransactions, availableRewards, userBalance] = await Promise.all([
        getRewardTransactions(fetchedUser.id),
        getAvailableRewards(fetchedUser.id),
        getUserBalance(fetchedUser.id) // Get balance directly from database
      ])

      console.log('Fetched data:', {
        user: fetchedUser.id,
        transactions: userTransactions,
        balance: userBalance,
        rewards: availableRewards
      })

      // Set transactions
      setTransactions(userTransactions as Transaction[])

      // Filter and set rewards (only show rewards with cost > 0)
      setRewards(availableRewards.filter(reward => reward.cost > 0))

      // Use the balance from database directly
      setBalance(userBalance)
      
    } catch (error) {
      console.error('Error fetching data:', error)
      toast.error('Failed to load rewards data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUserData()
    
    // Listen for balance updates from other pages
    const handleBalanceUpdate = (event: CustomEvent<number>) => {
      console.log('Balance update received:', event.detail)
      setBalance(event.detail)
      // Refresh transactions and rewards when balance updates
      if (user) {
        fetchUserData()
      }
    }

    window.addEventListener('balanceUpdated', handleBalanceUpdate as EventListener)
    
    return () => {
      window.removeEventListener('balanceUpdated', handleBalanceUpdate as EventListener)
    }
  }, [user])

  // Redeem a specific reward
  const handleRedeemReward = async (reward: RewardItem) => {
    if (!user) {
      toast.error('Please log in first')
      return
    }

    console.log('Redeeming reward:', reward, 'Current balance:', balance)

    if (balance < reward.cost) {
      toast.error(`You need ${reward.cost} points. You have only ${balance} points.`)
      return
    }

    try {
      // Call the backend to redeem reward
      await redeemReward(user.id, reward.id)
      
      // Create a transaction record
      await createTransaction(
        user.id, 
        'redeemed', 
        reward.cost, 
        `Redeemed: ${reward.name}`
      )

      toast.success(`Successfully redeemed: ${reward.name}!`)
      
      // Refresh data to update balance
      await fetchUserData()
      
      // Dispatch event to update balance everywhere
      const newBalance = balance - reward.cost
      setBalance(newBalance)
      window.dispatchEvent(new CustomEvent('balanceUpdated', { detail: newBalance }))
      
    } catch (error) {
      console.error('Error redeeming reward:', error)
      toast.error('Failed to redeem reward')
    }
  }

  // Redeem all points (convert to cash or special reward)
  const handleRedeemAllPoints = async () => {
    if (!user || balance <= 0) {
      toast.error('No points available to redeem')
      return
    }

    if (!confirm(`Redeem all ${balance} points? This will reset your balance to 0.`)) {
      return
    }

    try {
      // Call the backend to redeem all points
      await redeemReward(user.id, 0)
      
      // Create a transaction record
      await createTransaction(
        user.id, 
        'redeemed', 
        balance, 
        'Redeemed all points'
      )

      toast.success(`Successfully redeemed ${balance} points!`)
      
      // Refresh data
      await fetchUserData()
      
      // Dispatch event to update balance everywhere
      setBalance(0)
      window.dispatchEvent(new CustomEvent('balanceUpdated', { detail: 0 }))
      
    } catch (error) {
      console.error('Error redeeming all points:', error)
      toast.error('Failed to redeem points')
    }
  }

  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) {
        return 'Recently'
      }
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch (error) {
      return 'Recently'
    }
  }

  // Get transaction type for display
  const getTransactionType = (description: string) => {
    if (description.includes('reporting')) return 'earned'
    if (description.includes('collecting')) return 'earned'
    if (description.includes('Redeemed')) return 'redeemed'
    return 'earned'
  }

  // Get transaction icon
  const getTransactionIcon = (type: string) => {
    return type === 'earned' ? '↑' : '↓'
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader className="animate-spin h-8 w-8 text-green-500" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Rewards Dashboard</h1>
        <p className="text-gray-600">Earn points and redeem exciting rewards!</p>
      </div>

      {/* Balance Card - Prominent Display */}
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-6 mb-8 text-white shadow-lg">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold mb-2">Your Points Balance</h2>
            <div className="flex items-center">
              <Coins className="w-12 h-12 mr-4" />
              <div>
                <div className="text-5xl font-bold">{balance}</div>
                <p className="text-green-100 mt-1">Available Points</p>
              </div>
            </div>
          </div>
          
          {/* Redeem All Button */}
          <Button
            onClick={handleRedeemAllPoints}
            disabled={balance <= 0}
            className="bg-white text-green-600 hover:bg-green-50 font-semibold px-6 py-3"
          >
            <Gift className="w-5 h-5 mr-2" />
            Redeem All Points
          </Button>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid md:grid-cols-2 gap-8">
        
        {/* Left Column: Available Rewards */}
        <div>
          <div className="flex items-center mb-6">
            <Package className="w-6 h-6 text-green-500 mr-3" />
            <h2 className="text-2xl font-semibold text-gray-800">Available Rewards</h2>
          </div>

          {rewards.length === 0 ? (
            <div className="bg-gray-50 rounded-xl p-8 text-center">
              <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No rewards available at the moment</p>
              <p className="text-gray-400 text-sm mt-2">Check back later for new rewards!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {rewards.map(reward => (
                <div key={reward.id} className="bg-white rounded-xl p-5 shadow-md border border-gray-100">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800">{reward.name}</h3>
                      <p className="text-gray-600 text-sm mt-1">{reward.description}</p>
                    </div>
                    <div className="bg-green-50 text-green-700 font-bold px-4 py-2 rounded-lg">
                      {reward.cost} points
                    </div>
                  </div>
                  
                  <p className="text-gray-500 text-sm mb-4">
                    <span className="font-medium">How to collect:</span> {reward.collectionInfo}
                  </p>
                  
                  <Button
                    onClick={() => handleRedeemReward(reward)}
                    disabled={balance < reward.cost}
                    className="w-full bg-green-500 hover:bg-green-600 text-white font-medium py-3"
                  >
                    {balance >= reward.cost ? (
                      <>
                        <Gift className="w-4 h-4 mr-2" />
                        Redeem Now
                      </>
                    ) : (
                      'Need More Points'
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Transaction History */}
        <div>
          <div className="flex items-center mb-6">
            <History className="w-6 h-6 text-blue-500 mr-3" />
            <h2 className="text-2xl font-semibold text-gray-800">Transaction History</h2>
          </div>

          {transactions.length === 0 ? (
            <div className="bg-gray-50 rounded-xl p-8 text-center">
              <History className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No transactions yet</p>
              <p className="text-gray-400 text-sm mt-2">Your transactions will appear here</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-md overflow-hidden">
              {transactions.map(transaction => {
                const type = getTransactionType(transaction.description)
                return (
                  <div key={transaction.id} className="p-4 border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center">
                        {type === 'earned' ? (
                          <div className="bg-green-100 p-2 rounded-lg mr-4">
                            <ArrowUp className="w-5 h-5 text-green-600" />
                          </div>
                        ) : (
                          <div className="bg-red-100 p-2 rounded-lg mr-4">
                            <ArrowDown className="w-5 h-5 text-red-600" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-gray-800">{transaction.description}</p>
                          <p className="text-sm text-gray-500">{formatDate(transaction.date)}</p>
                        </div>
                      </div>
                      <span className={`font-bold ${type === 'earned' ? 'text-green-600' : 'text-red-600'}`}>
                        {type === 'earned' ? '+' : '-'}{transaction.amount}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* How It Works Section */}
          <div className="mt-8 bg-blue-50 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">How It Works</h3>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-start">
                <div className="bg-blue-100 text-blue-600 rounded-full w-6 h-6 flex items-center justify-center mr-3 mt-0.5">1</div>
                <span>Earn points by completing tasks and reports</span>
              </li>
              <li className="flex items-start">
                <div className="bg-blue-100 text-blue-600 rounded-full w-6 h-6 flex items-center justify-center mr-3 mt-0.5">2</div>
                <span>Browse available rewards and their point costs</span>
              </li>
              <li className="flex items-start">
                <div className="bg-blue-100 text-blue-600 rounded-full w-6 h-6 flex items-center justify-center mr-3 mt-0.5">3</div>
                <span>Redeem rewards when you have enough points</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}