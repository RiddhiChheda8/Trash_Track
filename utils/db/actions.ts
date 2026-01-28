import { db } from './dbConfig';
import { Users, Reports, Rewards, CollectedWastes, Notifications, Transactions } from './schema';
import { eq, sql, and, desc, ne } from 'drizzle-orm';

export async function createUser(email: string, name: string) {
  try {
    const [user] = await db.insert(Users).values({ email, name }).returning().execute();
    return user;
  } catch (error) {
    console.error("Error creating user:", error);
    return null;
  }
}

export async function getUserByEmail(email: string) {
  try {
    const [user] = await db.select().from(Users).where(eq(Users.email, email)).execute();
    return user;
  } catch (error) {
    console.error("Error fetching user by email:", error);
    return null;
  }
}

export async function createReport(
  userId: number,
  location: string,
  wasteType: string,
  amount: string,
  imageUrl?: string,
  verificationResult?: any
) {
  try {
    const [report] = await db
      .insert(Reports)
      .values({
        userId,
        location,
        wasteType,
        amount,
        imageUrl,
        verificationResult: verificationResult ? JSON.stringify(verificationResult) : null,
        status: "pending",
      })
      .returning()
      .execute();

    // Award 10 points for reporting waste
    const pointsEarned = 10;
    await updateRewardPoints(userId, pointsEarned);

    // Create a transaction for the earned points
    await createTransaction(userId, 'earned_report', pointsEarned, 'Points earned for reporting waste');

    // Create a notification for the user - FIXED with specific waste type
    await createNotification(
      userId,
      `🎉 You've earned ${pointsEarned} points for reporting ${wasteType} (${amount})!`,
      'reward'
    );

    // Dispatch event for new notification
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('newNotification'));
      }, 500);
    }

    return report;
  } catch (error) {
    console.error("Error creating report:", error);
    return null;
  }
}

export async function getReportsByUserId(userId: number) {
  try {
    const reports = await db.select().from(Reports).where(eq(Reports.userId, userId)).execute();
    return reports;
  } catch (error) {
    console.error("Error fetching reports:", error);
    return [];
  }
}

export async function getOrCreateReward(userId: number) {
  try {
    let [reward] = await db.select().from(Rewards).where(eq(Rewards.userId, userId)).execute();
    if (!reward) {
      [reward] = await db.insert(Rewards).values({
        userId,
        name: 'Default Reward',
        collectionInfo: 'Default Collection Info',
        points: 0,
        level: 1,
        isAvailable: true,
      }).returning().execute();
    }
    return reward;
  } catch (error) {
    console.error("Error getting or creating reward:", error);
    return null;
  }
}

export async function updateRewardPoints(userId: number, pointsToAdd: number) {
  try {
    const [updatedReward] = await db
      .update(Rewards)
      .set({ 
        points: sql`${Rewards.points} + ${pointsToAdd}`,
        updatedAt: new Date()
      })
      .where(eq(Rewards.userId, userId))
      .returning()
      .execute();
    return updatedReward;
  } catch (error) {
    console.error("Error updating reward points:", error);
    return null;
  }
}

export async function createCollectedWaste(reportId: number, collectorId: number, notes?: string) {
  try {
    const [collectedWaste] = await db
      .insert(CollectedWastes)
      .values({
        reportId,
        collectorId,
        collectionDate: new Date(),
      })
      .returning()
      .execute();
    return collectedWaste;
  } catch (error) {
    console.error("Error creating collected waste:", error);
    return null;
  }
}

export async function getCollectedWastesByCollector(collectorId: number) {
  try {
    return await db.select().from(CollectedWastes).where(eq(CollectedWastes.collectorId, collectorId)).execute();
  } catch (error) {
    console.error("Error fetching collected wastes:", error);
    return [];
  }
}

export async function createNotification(userId: number, message: string, type: string) {
  try {
    const [notification] = await db
      .insert(Notifications)
      .values({ userId, message, type })
      .returning()
      .execute();
    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
    return null;
  }
}

export async function getUnreadNotifications(userId: number) {
  try {
    return await db.select().from(Notifications).where(
      and(
        eq(Notifications.userId, userId),
        eq(Notifications.isRead, false)
      )
    ).execute();
  } catch (error) {
    console.error("Error fetching unread notifications:", error);
    return [];
  }
}

export async function markNotificationAsRead(notificationId: number) {
  try {
    await db.update(Notifications).set({ isRead: true }).where(eq(Notifications.id, notificationId)).execute();
  } catch (error) {
    console.error("Error marking notification as read:", error);
  }
}

export async function getPendingReports() {
  try {
    return await db.select().from(Reports).where(eq(Reports.status, "pending")).execute();
  } catch (error) {
    console.error("Error fetching pending reports:", error);
    return [];
  }
}

export async function updateReportStatus(reportId: number, status: string) {
  try {
    const [updatedReport] = await db
      .update(Reports)
      .set({ status })
      .where(eq(Reports.id, reportId))
      .returning()
      .execute();
    return updatedReport;
  } catch (error) {
    console.error("Error updating report status:", error);
    return null;
  }
}

export async function getRecentReports(limit: number = 30) {
  try {
    const reports = await db
      .select()
      .from(Reports)
      .orderBy(desc(Reports.createdAt))
      .limit(limit)
      .execute();
    return reports;
  } catch (error) {
    console.error("Error fetching recent reports:", error);
    return [];
  }
}

export async function getWasteCollectionTasks(limit: number = 20) {
  try {
    const tasks = await db
      .select({
        id: Reports.id,
        location: Reports.location,
        wasteType: Reports.wasteType,
        amount: Reports.amount,
        status: Reports.status,
        date: Reports.createdAt,
        collectorId: Reports.collectorId,
      })
      .from(Reports)
      .limit(limit)
      .execute();

    return tasks.map(task => ({
      ...task,
      date: task.date.toISOString().split('T')[0],
    }));
  } catch (error) {
    console.error("Error fetching waste collection tasks:", error);
    return [];
  }
}

// FIXED: Properly adds points to existing reward
export async function saveReward(userId: number, amount: number) {
  try {
    // Ensure user has a reward record
    await getOrCreateReward(userId);
    
    // Add points to existing reward
    const [updatedReward] = await db
      .update(Rewards)
      .set({ 
        points: sql`${Rewards.points} + ${amount}`,
        updatedAt: new Date()
      })
      .where(eq(Rewards.userId, userId))
      .returning()
      .execute();
    
    // Create a transaction for this reward
    await createTransaction(userId, 'earned_collect', amount, 'Points earned for collecting waste');

    return updatedReward;
  } catch (error) {
    console.error("Error saving reward:", error);
    throw error;
  }
}

export async function saveCollectedWaste(reportId: number, collectorId: number, verificationResult: any) {
  try {
    const [collectedWaste] = await db
      .insert(CollectedWastes)
      .values({
        reportId,
        collectorId,
        collectionDate: new Date(),
        status: 'verified',
      })
      .returning()
      .execute();
    return collectedWaste;
  } catch (error) {
    console.error("Error saving collected waste:", error);
    throw error;
  }
}

export async function updateTaskStatus(reportId: number, newStatus: string, collectorId?: number) {
  try {
    const updateData: any = { status: newStatus };
    if (collectorId !== undefined) {
      updateData.collectorId = collectorId;
    }
    const [updatedReport] = await db
      .update(Reports)
      .set(updateData)
      .where(eq(Reports.id, reportId))
      .returning()
      .execute();
    return updatedReport;
  } catch (error) {
    console.error("Error updating task status:", error);
    throw error;
  }
}

export async function getAllRewards() {
  try {
    const rewards = await db
      .select({
        id: Rewards.id,
        userId: Rewards.userId,
        points: Rewards.points,
        level: Rewards.level,
        createdAt: Rewards.createdAt,
        userName: Users.name,
      })
      .from(Rewards)
      .leftJoin(Users, eq(Rewards.userId, Users.id))
      .orderBy(desc(Rewards.points))
      .execute();

    return rewards;
  } catch (error) {
    console.error("Error fetching all rewards:", error);
    return [];
  }
}

export async function getRewardTransactions(userId: number) {
  try {
    const transactions = await db
      .select({
        id: Transactions.id,
        type: Transactions.type,
        amount: Transactions.amount,
        description: Transactions.description,
        date: Transactions.date,
      })
      .from(Transactions)
      .where(eq(Transactions.userId, userId))
      .orderBy(desc(Transactions.date))
      .limit(10)
      .execute();

    const formattedTransactions = transactions.map(t => ({
      ...t,
      date: t.date.toISOString().split('T')[0],
    }));

    return formattedTransactions;
  } catch (error) {
    console.error("Error fetching reward transactions:", error);
    return [];
  }
}

export async function getAvailableRewards(userId: number) {
  try {
    // Get user's total points
    const userReward = await getOrCreateReward(userId);
    const userPoints = userReward ? userReward.points : 0;

    // Get available rewards from the database
    const dbRewards = await db
      .select({
        id: Rewards.id,
        name: Rewards.name,
        cost: Rewards.points,
        description: Rewards.description,
        collectionInfo: Rewards.collectionInfo,
      })
      .from(Rewards)
      .where(eq(Rewards.isAvailable, true))
      .execute();

    // Combine user points and database rewards
    const allRewards = [
      {
        id: 0,
        name: "Your Points",
        cost: userPoints,
        description: "Redeem your earned points",
        collectionInfo: "Points earned from reporting and collecting waste"
      },
      ...dbRewards
    ];

    return allRewards;
  } catch (error) {
    console.error("Error fetching available rewards:", error);
    return [];
  }
}

export async function createTransaction(userId: number, type: 'earned_report' | 'earned_collect' | 'redeemed', amount: number, description: string) {
  try {
    const [transaction] = await db
      .insert(Transactions)
      .values({ userId, type, amount, description })
      .returning()
      .execute();
    return transaction;
  } catch (error) {
    console.error("Error creating transaction:", error);
    throw error;
  }
}

export async function redeemReward(userId: number, rewardId: number) {
  try {
    const userReward = await getOrCreateReward(userId) as any;
    
    if (rewardId === 0) {
      // Redeem all points
      const [updatedReward] = await db.update(Rewards)
        .set({ 
          points: 0,
          updatedAt: new Date(),
        })
        .where(eq(Rewards.userId, userId))
        .returning()
        .execute();

      await createTransaction(userId, 'redeemed', userReward.points, `Redeemed all points: ${userReward.points}`);

      return updatedReward;
    } else {
      const availableReward = await db.select().from(Rewards).where(eq(Rewards.id, rewardId)).execute();

      if (!userReward || !availableReward[0] || userReward.points < availableReward[0].points) {
        throw new Error("Insufficient points or invalid reward");
      }

      const [updatedReward] = await db.update(Rewards)
        .set({ 
          points: sql`${Rewards.points} - ${availableReward[0].points}`,
          updatedAt: new Date(),
        })
        .where(eq(Rewards.userId, userId))
        .returning()
        .execute();

      await createTransaction(userId, 'redeemed', availableReward[0].points, `Redeemed: ${availableReward[0].name}`);

      return updatedReward;
    }
  } catch (error) {
    console.error("Error redeeming reward:", error);
    throw error;
  }
}

// FIXED: Efficient balance calculation
export async function getUserBalance(userId: number): Promise<number> {
  try {
    // Get current points from Rewards table directly
    const [reward] = await db
      .select({ points: Rewards.points })
      .from(Rewards)
      .where(eq(Rewards.userId, userId))
      .execute();
    
    return reward ? reward.points : 0;
  } catch (error) {
    console.error("Error getting user balance:", error);
    return 0;
  }
}

// Helper function to get user points
export async function getUserPoints(userId: number): Promise<number> {
  const balance = await getUserBalance(userId);
  return balance;
}