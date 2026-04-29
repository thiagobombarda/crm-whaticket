import React, { useContext } from "react";
import { Navigate } from "react-router-dom";

import { AuthContext } from "../context/Auth/AuthContext";
import BackdropLoading from "../components/BackdropLoading";

const Route = ({ component: Component, isPrivate = false }) => {
  const { isAuth, loading } = useContext(AuthContext);

  if (!isAuth && isPrivate) {
    return (
      <>
        {loading && <BackdropLoading />}
        <Navigate to="/login" replace />
      </>
    );
  }

  if (isAuth && !isPrivate) {
    return (
      <>
        {loading && <BackdropLoading />}
        <Navigate to="/" replace />
      </>
    );
  }

  return (
    <>
      {loading && <BackdropLoading />}
      <Component />
    </>
  );
};

export default Route;
