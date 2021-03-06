/* eslint-disable jsx-a11y/anchor-is-valid */
/*
Copyright 2018 Province of British Columbia

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at 

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

Created by Patrick Simonian
*/
import React from 'react';
import { Link } from 'gatsby';
import PropTypes from 'prop-types';
import styles from './Navbar.module.css';
import { MAIN_NAV_ROUTES } from '../../constants/routes';

export const Navbar = ({ mobile }) => {
  const links = Object.keys(MAIN_NAV_ROUTES).map(resourceType => {
    return (
      <li key={MAIN_NAV_ROUTES[resourceType].to}>
        <Link exact to={MAIN_NAV_ROUTES[resourceType].to} activeClassName={styles.ActiveFilter}>
          {MAIN_NAV_ROUTES[resourceType].text}
        </Link>
      </li>
    );
  });

  return (
    <nav className={styles.Navbar}>
      <ul className={mobile ? styles.mobileOnly : styles.largeOnly}>{links}</ul>
    </nav>
  );
};

Navbar.propTypes = {
  mobile: PropTypes.bool,
};

Navbar.defaultProps = {
  mobile: false,
};

export default Navbar;
