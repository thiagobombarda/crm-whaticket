import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.changeColumn("Contacts", "profilePicUrl", {
      type: DataTypes.TEXT,
      allowNull: true
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.changeColumn("Contacts", "profilePicUrl", {
      type: DataTypes.STRING,
      allowNull: true
    });
  }
};
