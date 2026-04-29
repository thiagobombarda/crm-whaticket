import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ToastContainer } from "react-toastify";

import LoggedInLayout from "../layout";
import Dashboard from "../pages/Dashboard/";
import Tickets from "../pages/Tickets/";
import CRM from "../pages/CRM/";
import Signup from "../pages/Signup/";
import Login from "../pages/Login/";
import Connections from "../pages/Connections/";
import Settings from "../pages/Settings/";
import Users from "../pages/Users";
import Contacts from "../pages/Contacts/";
import QuickAnswers from "../pages/QuickAnswers/";
import Queues from "../pages/Queues/";
import { AuthProvider } from "../context/Auth/AuthContext";
import { WhatsAppsProvider } from "../context/WhatsApp/WhatsAppsContext";
import { ThemeProvider } from "../context/DarkMode";
import PrivateRoute from "./Route";

const AppRoutes = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <Routes>
            <Route path="/login" element={<PrivateRoute component={Login} />} />
            <Route path="/signup" element={<PrivateRoute component={Signup} />} />
            <Route
              path="/*"
              element={
                <WhatsAppsProvider>
                  <LoggedInLayout>
                    <Routes>
                      <Route path="/" element={<PrivateRoute component={Dashboard} isPrivate />} />
                      <Route path="/tickets/:ticketId?" element={<PrivateRoute component={Tickets} isPrivate />} />
                      <Route path="/crm" element={<PrivateRoute component={CRM} isPrivate />} />
                      <Route path="/connections" element={<PrivateRoute component={Connections} isPrivate />} />
                      <Route path="/contacts" element={<PrivateRoute component={Contacts} isPrivate />} />
                      <Route path="/users" element={<PrivateRoute component={Users} isPrivate />} />
                      <Route path="/quickAnswers" element={<PrivateRoute component={QuickAnswers} isPrivate />} />
                      <Route path="/Settings" element={<PrivateRoute component={Settings} isPrivate />} />
                      <Route path="/Queues" element={<PrivateRoute component={Queues} isPrivate />} />
                    </Routes>
                  </LoggedInLayout>
                </WhatsAppsProvider>
              }
            />
          </Routes>
          <ToastContainer autoClose={3000} />
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default AppRoutes;
