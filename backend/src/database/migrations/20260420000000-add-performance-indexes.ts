import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Tickets: composite for FindOrCreateTicketService (status + contactId + whatsappId)
      await queryInterface.addIndex(
        "Tickets",
        ["status", "contactId", "whatsappId"],
        {
          name: "tickets_status_contact_whatsapp_idx",
          transaction
        }
      );

      // Tickets: for ListTicketsService filtered by user
      await queryInterface.addIndex("Tickets", ["userId", "status"], {
        name: "tickets_user_status_idx",
        transaction
      });

      // Tickets: filter by queue
      await queryInterface.addIndex("Tickets", ["queueId"], {
        name: "tickets_queue_idx",
        transaction
      });

      // Tickets: ORDER BY updatedAt DESC
      await queryInterface.addIndex("Tickets", ["updatedAt"], {
        name: "tickets_updated_at_idx",
        transaction
      });

      // Tickets: unread messages filter
      await queryInterface.addIndex("Tickets", ["unreadMessages"], {
        name: "tickets_unread_idx",
        transaction
      });

      // Messages: listing messages for a ticket ordered by creation
      await queryInterface.addIndex("Messages", ["ticketId", "createdAt"], {
        name: "messages_ticket_created_idx",
        transaction
      });

      // Messages: by contactId (used in eager loads and ack updates)
      await queryInterface.addIndex("Messages", ["contactId"], {
        name: "messages_contact_idx",
        transaction
      });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  down: async (queryInterface: QueryInterface) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeIndex(
        "Tickets",
        "tickets_status_contact_whatsapp_idx",
        { transaction }
      );
      await queryInterface.removeIndex("Tickets", "tickets_user_status_idx", {
        transaction
      });
      await queryInterface.removeIndex("Tickets", "tickets_queue_idx", {
        transaction
      });
      await queryInterface.removeIndex("Tickets", "tickets_updated_at_idx", {
        transaction
      });
      await queryInterface.removeIndex("Tickets", "tickets_unread_idx", {
        transaction
      });
      await queryInterface.removeIndex(
        "Messages",
        "messages_ticket_created_idx",
        { transaction }
      );
      await queryInterface.removeIndex("Messages", "messages_contact_idx", {
        transaction
      });
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }
};
