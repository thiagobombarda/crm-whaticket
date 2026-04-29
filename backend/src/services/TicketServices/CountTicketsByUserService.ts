import { Op, fn, col, literal } from "sequelize";
import { startOfDay, endOfDay } from "date-fns";
import Ticket from "../../models/Ticket";
import User from "../../models/User";

interface UserTicketCount {
  userId: number;
  userName: string;
  open: number;
  closed: number;
  pending: number;
  total: number;
}

const CountTicketsByUserService = async (): Promise<UserTicketCount[]> => {
  const today = new Date();

  const results = await Ticket.findAll({
    where: {
      createdAt: {
        [Op.between]: [+startOfDay(today), +endOfDay(today)]
      },
      userId: { [Op.not]: null as any }
    },
    attributes: [
      "userId",
      [fn("COUNT", col("Ticket.id")), "total"],
      [fn("SUM", literal("CASE WHEN status = 'open' THEN 1 ELSE 0 END")), "open"],
      [fn("SUM", literal("CASE WHEN status = 'closed' THEN 1 ELSE 0 END")), "closed"],
      [fn("SUM", literal("CASE WHEN status = 'pending' THEN 1 ELSE 0 END")), "pending"],
    ],
    include: [{ model: User, as: "user", attributes: ["id", "name"] }],
    group: ["userId", "user.id"],
    order: [[fn("COUNT", col("Ticket.id")), "DESC"]],
    raw: true,
    nest: true,
  });

  return (results as any[]).map(r => ({
    userId: r.userId,
    userName: r.user?.name || "Sem nome",
    open: Number(r.open) || 0,
    closed: Number(r.closed) || 0,
    pending: Number(r.pending) || 0,
    total: Number(r.total) || 0,
  }));
};

export default CountTicketsByUserService;
