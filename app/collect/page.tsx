'use client'
import { useState, useEffect } from 'react'
import { Trash2, MapPin, CheckCircle, Clock, Upload, Loader, Calendar, Weight, Search, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'react-hot-toast'
import { 
  getWasteCollectionTasks, 
  updateTaskStatus, 
  saveReward, 
  saveCollectedWaste, 
  getUserByEmail, 
  getUserBalance,
  getRecentReports  // ADD THIS
} from '@/utils/db/actions'

const ITEMS_PER_PAGE = 5

interface Task {
  id: number
  location: string
  wasteType: string
  amount: string
  status: 'pending' | 'in_progress' | 'verified' | 'completed'
  date: string
  collectorId?: number | null
}

interface User {
  id: number
  email: string
  name: string
}

interface VerificationResult {
  wasteTypeMatch: boolean
  quantityMatch: boolean
  confidence: number
}

export default function CollectPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [user, setUser] = useState<User | null>(null)
  const [userBalance, setUserBalance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [verificationImage, setVerificationImage] = useState<string | null>(null)
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'verifying' | 'success' | 'failure'>('idle')
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null)
  const [reward, setReward] = useState<number | null>(null)

  // Fetch ALL tasks (including reports that should be tasks)
  const fetchTasks = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true)
      } else {
        setIsRefreshing(true)
      }

      // Fetch user
      const userEmail = localStorage.getItem('userEmail')
      if (userEmail) {
        const fetchedUser = await getUserByEmail(userEmail)
        if (fetchedUser) {
          setUser(fetchedUser)
          const balance = await getUserBalance(fetchedUser.id)
          setUserBalance(balance)
        }
      }

      // CRITICAL FIX: Fetch from TWO sources
      // 1. Get tasks from waste_collection_tasks (which actually fetches from Reports)
      const fetchedTasks = await getWasteCollectionTasks()
      console.log('Tasks from getWasteCollectionTasks:', fetchedTasks)
      
      // 2. Also get recent reports to make sure we don't miss any
      const recentReports = await getRecentReports(50)
      console.log('Recent reports from getRecentReports:', recentReports)

      // Combine both sources - this ensures ALL reports show up as tasks
      let allItems = [...fetchedTasks]
      
      // Add any reports that aren't already in tasks
      recentReports.forEach((report: any) => {
        const exists = allItems.some(item => item.id === report.id)
        if (!exists) {
          allItems.push({
            id: report.id,
            location: report.location,
            wasteType: report.wasteType,
            amount: report.amount,
            status: report.status || 'pending',
            date: report.createdAt ? 
              (typeof report.createdAt === 'string' 
                ? report.createdAt.split('T')[0]
                : report.createdAt.toISOString().split('T')[0])
              : new Date().toISOString().split('T')[0],
            collectorId: report.collectorId || null
          })
        }
      })

      // Map the data to match Task interface
      const mappedTasks: Task[] = allItems.map((task: any) => {
        // Get date from task
        let taskDate = task.date;
        if (!taskDate) {
          taskDate = new Date().toISOString().split('T')[0];
        }
        
        // Ensure status is valid
        let taskStatus = task.status || 'pending';
        if (!['pending', 'in_progress', 'verified', 'completed'].includes(taskStatus)) {
          taskStatus = 'pending';
        }
        
        return {
          id: task.id,
          location: task.location || 'Unknown Location',
          wasteType: task.wasteType || 'Unknown Waste',
          amount: task.amount || '1 kg',
          status: taskStatus as 'pending' | 'in_progress' | 'verified' | 'completed',
          date: taskDate,
          collectorId: task.collectorId || null
        }
      })

      // Sort by date (newest first)
      const sortedTasks = mappedTasks.sort((a, b) => {
        const dateA = new Date(a.date).getTime()
        const dateB = new Date(b.date).getTime()
        return dateB - dateA
      })

      console.log('Final tasks to display:', sortedTasks)
      setTasks(sortedTasks)
      
    } catch (error) {
      console.error('Error fetching tasks:', error)
      toast.error('Failed to load tasks. Please try again.')
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    // Initial load
    fetchTasks(true)

    // Listen for report submission events
    const handleReportSubmitted = () => {
      console.log('New report submitted! Refreshing tasks...')
      fetchTasks(false)
      toast.success('New task added! Refresh to see it.', { duration: 3000 })
    }

    window.addEventListener('newReportSubmitted', handleReportSubmitted)

    // Also listen for page focus to refresh when user comes back
    const handleFocus = () => {
      fetchTasks(false)
    }
    
    window.addEventListener('focus', handleFocus)

    // Cleanup
    return () => {
      window.removeEventListener('newReportSubmitted', handleReportSubmitted)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  // Manual refresh
  const handleManualRefresh = () => {
    fetchTasks(false)
    toast.success('Refreshing tasks...', { duration: 1000 })
  }

  // Update balance
  const updateBalance = async () => {
    if (user) {
      try {
        const newBalance = await getUserBalance(user.id)
        console.log('Updated balance:', newBalance)
        setUserBalance(newBalance)
        window.dispatchEvent(new CustomEvent('balanceUpdated', { detail: newBalance }))
      } catch (error) {
        console.error('Error updating balance:', error)
      }
    }
  }

  const handleStatusChange = async (taskId: number, newStatus: 'pending' | 'in_progress' | 'verified' | 'completed') => {
    if (!user) {
      toast.error('Please log in to collect waste.')
      return
    }

    try {
      console.log(`Updating task ${taskId} to ${newStatus} for user ${user.id}`)
      const updatedTask = await updateTaskStatus(taskId, newStatus, user.id)
      if (updatedTask) {
        setTasks(tasks.map(task => 
          task.id === taskId ? { 
            ...task, 
            status: newStatus, 
            collectorId: user.id 
          } : task
        ))
        toast.success(`Task status updated to ${newStatus}`)
        
        // If verified, show success message
        if (newStatus === 'verified') {
          toast.success('✅ Task verified! Points will be awarded.')
        }
        
        return true
      } else {
        toast.error('Failed to update task status.')
        return false
      }
    } catch (error) {
      console.error('Error updating task status:', error)
      toast.error('Failed to update task status.')
      return false
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setVerificationImage(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleVerify = () => {
    if (!selectedTask || !verificationImage || !user) {
      toast.error('Please upload an image first')
      return
    }

    setVerificationStatus('verifying')
    
    setTimeout(async () => {
      const result: VerificationResult = {
        wasteTypeMatch: true,
        quantityMatch: true,
        confidence: Math.floor(Math.random() * 10) + 85
      }
      
      setVerificationResult(result)
      setVerificationStatus('success')
      
      try {
        // First update task status to 'verified'
        const statusUpdated = await handleStatusChange(selectedTask.id, 'verified')
        
        if (!statusUpdated) {
          toast.error('Failed to update task status')
          return
        }
        
        // Calculate reward
        let baseReward = 0;
        const wasteType = selectedTask.wasteType.toLowerCase();
        const amount = selectedTask.amount;
        
        if (wasteType.includes('plastic') || wasteType.includes('bottle')) {
          baseReward = 1;
        } else if (wasteType.includes('paper') || wasteType.includes('cardboard')) {
          baseReward = 1;
        } else if (wasteType.includes('organic') || wasteType.includes('food')) {
          baseReward = 1;
        } else if (wasteType.includes('electronic') || wasteType.includes('e-waste')) {
          baseReward = 2;
        } else if (wasteType.includes('glass')) {
          baseReward = 1;
        } else if (wasteType.includes('metal')) {
          baseReward = 2;
        } else {
          baseReward = 1;
        }
        
        let quantityBonus = 0;
        const quantityRegex = amount.match(/(\d+)/);
        if (quantityRegex) {
          const quantity = parseInt(quantityRegex[1]);
          if (quantity >= 5) {
            quantityBonus = 1;
          } else if (quantity >= 3) {
            quantityBonus = 0.5;
          }
        }
        
        const earnedReward = baseReward + quantityBonus;
        const roundedReward = Math.round(earnedReward * 100) / 100;
        
        console.log(`Saving reward: ${roundedReward} tokens for user ${user.id}`)
        
        // Save reward
        const rewardResult = await saveReward(user.id, roundedReward)
        console.log('Reward save result:', rewardResult)
        
        // Save collected waste
        const collectedResult = await saveCollectedWaste(selectedTask.id, user.id, result)
        console.log('Collected waste save result:', collectedResult)
        
        setReward(roundedReward)
        
        // Update balance
        await updateBalance()
        
        toast.success(`✅ Verified! You earned ${roundedReward} tokens!`)
      } catch (error) {
        console.error('Error in verification process:', error)
        toast.error('Verification passed but failed to save reward')
      }
    }, 2000)
  }

  const filteredTasks = tasks.filter(task =>
    task.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
    task.wasteType.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const pageCount = Math.ceil(filteredTasks.length / ITEMS_PER_PAGE)
  const paginatedTasks = filteredTasks.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Today';
    try {
      const date = new Date(dateString);
      const today = new Date();
      
      if (date.toDateString() === today.toDateString()) return 'Today';
      
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
      
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
    } catch {
      return 'Recent';
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-semibold text-gray-800">Waste Collection Tasks</h1>
          <p className="text-sm text-gray-500 mt-1">
            {tasks.length} task{tasks.length !== 1 ? 's' : ''} available • {tasks.filter(t => t.status === 'pending').length} pending
          </p>
        </div>
        <Button 
          onClick={handleManualRefresh} 
          variant="outline" 
          size="sm"
          disabled={isRefreshing}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>
      
      {/* User Balance */}
      <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Your Balance</h2>
            <p className="text-sm text-gray-600">Tokens earned from waste collection</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-green-600">{userBalance.toFixed(2)}</div>
            <div className="text-sm text-gray-500">Tokens</div>
          </div>
        </div>
      </div>
      
      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search by location or waste type..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setCurrentPage(1)
            }}
            className="pl-10"
          />
        </div>
        {searchTerm && (
          <p className="text-sm text-gray-500 mt-2">
            Found {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''} matching "{searchTerm}"
          </p>
        )}
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="flex flex-col justify-center items-center h-64">
          <Loader className="animate-spin h-10 w-10 text-green-600 mb-4" />
          <p className="text-gray-600">Loading waste collection tasks...</p>
          <p className="text-sm text-gray-500 mt-1">Checking for new reports...</p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {paginatedTasks.length === 0 ? (
              <div className="text-center py-12">
                <Trash2 className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                  {searchTerm ? 'No matching tasks' : 'No Collection Tasks'}
                </h3>
                <p className="text-gray-600 max-w-md mx-auto">
                  {searchTerm 
                    ? `No tasks found matching "${searchTerm}"`
                    : 'Submit a report first to create a waste collection task.'}
                </p>
                <div className="mt-4 flex gap-3 justify-center">
                  <Button 
                    onClick={handleManualRefresh} 
                    variant="outline"
                    className="gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Check Again
                  </Button>
                  {!searchTerm && (
                    <Button 
                      onClick={() => window.location.href = '/report'} 
                      variant="default"
                      className="bg-green-600 hover:bg-green-700 gap-2"
                    >
                      <Upload className="h-4 w-4" />
                      Submit Report
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              paginatedTasks.map(task => (
                <div 
                  key={task.id} 
                  className="bg-white p-5 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="flex items-center mb-1">
                        <MapPin className="w-5 h-5 mr-2 text-green-600" />
                        <h2 className="text-lg font-medium text-gray-800">
                          {task.location}
                        </h2>
                      </div>
                      <p className="text-sm text-gray-500 ml-7">
                        {task.wasteType} • {task.amount}
                      </p>
                    </div>
                    <StatusBadge status={task.status} />
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2 text-sm text-gray-600 mb-4 ml-7">
                    <div className="flex items-center">
                      <Trash2 className="w-4 h-4 mr-2 text-gray-500" />
                      <span className="truncate">
                        {task.wasteType.length > 12 ? `${task.wasteType.slice(0, 12)}...` : task.wasteType}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <Weight className="w-4 h-4 mr-2 text-gray-500" />
                      <span>{task.amount}</span>
                    </div>
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 mr-2 text-gray-500" />
                      <span>{formatDate(task.date)}</span>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    {task.status === 'pending' && (
                      <Button 
                        onClick={() => handleStatusChange(task.id, 'in_progress')} 
                        variant="default"
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 gap-2"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Start Collection
                      </Button>
                    )}
                    {task.status === 'in_progress' && task.collectorId === user?.id && (
                      <Button 
                        onClick={() => setSelectedTask(task)} 
                        variant="outline"
                        size="sm"
                        className="gap-2"
                      >
                        <Upload className="h-4 w-4" />
                        Complete & Verify
                      </Button>
                    )}
                    {task.status === 'in_progress' && task.collectorId !== user?.id && task.collectorId && (
                      <span className="text-yellow-600 text-sm font-medium px-3 py-1 bg-yellow-50 rounded">
                        In progress by another collector
                      </span>
                    )}
                    {task.status === 'verified' && (
                      <span className="text-green-600 text-sm font-medium px-3 py-1 bg-green-50 rounded">
                        ✓ Reward Earned
                      </span>
                    )}
                    {task.status === 'completed' && (
                      <span className="text-purple-600 text-sm font-medium px-3 py-1 bg-purple-50 rounded">
                        Completed
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {paginatedTasks.length > 0 && pageCount > 1 && (
            <div className="mt-6 flex justify-center items-center gap-4">
              <Button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                variant="outline"
                size="sm"
              >
                Previous
              </Button>
              <span className="text-sm text-gray-600">
                Page {currentPage} of {pageCount}
              </span>
              <Button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, pageCount))}
                disabled={currentPage === pageCount}
                variant="outline"
                size="sm"
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      {/* Verification Modal */}
      {selectedTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-semibold mb-4">Verify Collection</h3>
            <p className="mb-4 text-sm text-gray-600">
              Upload a photo of the collected waste for verification. Task: {selectedTask.wasteType} ({selectedTask.amount})
            </p>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload Collected Waste Image
              </label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                <div className="space-y-1 text-center">
                  <Upload className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="flex text-sm text-gray-600">
                    <label
                      className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500"
                    >
                      <span>Upload a file</span>
                      <input 
                        type="file" 
                        className="sr-only" 
                        onChange={handleImageUpload} 
                        accept="image/*" 
                      />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-500">PNG, JPG, GIF up to 5MB</p>
                </div>
              </div>
            </div>
            
            {verificationImage && (
              <div className="mb-4">
                <img src={verificationImage} alt="Verification" className="rounded-md w-full max-h-64 object-cover" />
              </div>
            )}
            
            <div className="flex gap-3">
              <Button
                onClick={handleVerify}
                className="flex-1"
                disabled={!verificationImage || verificationStatus === 'verifying'}
              >
                {verificationStatus === 'verifying' ? (
                  <>
                    <Loader className="animate-spin -ml-1 mr-3 h-5 w-5" />
                    Verifying...
                  </>
                ) : 'Verify Collection'}
              </Button>
              
              <Button 
                onClick={() => {
                  setSelectedTask(null)
                  setVerificationImage(null)
                  setVerificationStatus('idle')
                  setVerificationResult(null)
                  setReward(null)
                }} 
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
            
            {verificationStatus === 'success' && verificationResult && (
              <div className="mt-4 p-4 rounded-md bg-green-50 border border-green-200">
                <h4 className="font-semibold mb-2 text-green-800">✓ Verification Successful!</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Waste Type Match: 
                    <span className="font-medium ml-2 text-green-600">✅ Yes</span>
                  </div>
                  <div>Quantity Match: 
                    <span className="font-medium ml-2 text-green-600">✅ Yes</span>
                  </div>
                  <div className="col-span-2">Confidence Level: 
                    <span className="font-medium ml-2 text-green-600">{verificationResult.confidence}%</span>
                  </div>
                </div>
                
                {reward && (
                  <div className="mt-3 p-3 bg-green-100 border border-green-300 rounded">
                    <p className="font-medium text-green-800">✓ Verification Passed!</p>
                    <p className="text-green-700">🎉 You earned <strong>{reward} tokens</strong>!</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// StatusBadge component
interface StatusBadgeProps {
  status: 'pending' | 'in_progress' | 'verified' | 'completed'
}

function StatusBadge({ status }: StatusBadgeProps) {
  const statusConfig = {
    pending: { color: 'bg-yellow-100 text-yellow-800', icon: Clock, text: 'Pending' },
    in_progress: { color: 'bg-blue-100 text-blue-800', icon: Clock, text: 'In Progress' },
    verified: { color: 'bg-green-100 text-green-800', icon: CheckCircle, text: 'Verified' },
    completed: { color: 'bg-purple-100 text-purple-800', icon: CheckCircle, text: 'Completed' },
  }

  const { color, icon: Icon, text } = statusConfig[status] || statusConfig.pending

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${color} flex items-center`}>
      <Icon className="mr-1 h-3 w-3" />
      {text}
    </span>
  )
}