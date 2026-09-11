function ftoc(Fahr) {
  var Cels;
  Cels = (5 / 9) * (Fahr - 32);
  return Cels;
}
function ctof(Cels) {
  var Fahr;
  Fahr = 1.8 * Cels + 32;
  return Fahr;
}
// This function computes the clear sky global horizontal irradiance (GHI)
// given the cosine of the solar zenith angle.
function clearSkyIrradiance(cza) {

    // Daneshyar-Paltridge-Proctor (DPP) model (1978)
    // pass z to function or back out from cza

    // Use the "very simple" Kasten-Czeplak (1980) algorithm cited
    // in the Sandia global horizontal irradiance paper. This algorithm
    // produces negative numbers as the zenith angle approaches 90 degrees,
    // so enforce a minimum irradiance of zero:
    var ghi = 910*cza - 30;

    // Haurwitz model (1945)
    //var ghi = 1098*cza*Math.exp(-0.057/cza);

    // Berger-Duffie (BD) model (1979)
    //var ghi = 1380*0.70*cza;
	
    // Adnot-Bourges-Campana-Gicquel (ABCG) model (1979)
    //var ghi = 951.39*Math.pow(cza,1.15);

    // Robledo-Soler (RS) model (2000)
    // pass z to function or back out from cza

    return(Math.max(ghi, 0));

}
    // ----------------------------------------------------------------
    // Now include the functions that calculate WBGT. I've simply copied
    // them into this file from wbgt.js. If anything changes in the
    // wbgt.js file, the functions below will also need to change.
    
/*
               Copyright © 2008, UChicago Argonne, LLC
                       All Rights Reserved

                        WBGT, Version 1.1

			     James C. Liljegren
              Decision & Information Sciences Division

			     OPEN SOURCE LICENSE

Redistribution and use in source and binary forms, with or without modification, 
are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, 
   this list of conditions and the following disclaimer.  Software changes, 
   modifications, or derivative works, should be noted with comments and 
   the author and organization’s name.

2. Redistributions in binary form must reproduce the above copyright notice, 
   this list of conditions and the following disclaimer in the documentation 
   and/or other materials provided with the distribution.

3. Neither the names of UChicago Argonne, LLC or the Department of Energy 
   nor the names of its contributors may be used to endorse or promote products 
   derived from this software without specific prior written permission.

4. The software and the end-user documentation included with the 
   redistribution, if any, must include the following acknowledgment:

   "This product includes software produced by UChicago Argonne, LLC 
   under Contract No. DE-AC02-06CH11357 with the Department of Energy.”

******************************************************************************************
DISCLAIMER

THE SOFTWARE IS SUPPLIED "AS IS" WITHOUT WARRANTY OF ANY KIND.

NEITHER THE UNITED STATES GOVERNMENT, NOR THE UNITED STATES DEPARTMENT OF ENERGY, 
NOR UCHICAGO ARGONNE, LLC, NOR ANY OF THEIR EMPLOYEES, MAKES ANY WARRANTY, EXPRESS 
OR IMPLIED, OR ASSUMES ANY LEGAL LIABILITY OR RESPONSIBILITY FOR THE ACCURACY, 
COMPLETENESS, OR USEFULNESS OF ANY INFORMATION, DATA, APPARATUS, PRODUCT, OR 
PROCESS DISCLOSED, OR REPRESENTS THAT ITS USE WOULD NOT INFRINGE PRIVATELY OWNED RIGHTS.

******************************************************************************************/

/* In 2017 this software was translated from the C programming language into JavaScript by: 

Aaron Tustin
Office of Occupational Medicine and Nursing
Directorate of Technical Support and Emergency Management
Occupational Safety and Health Adminstration (OSHA)
Washington, DC
tustin.aaron.w@dol.gov

*/

/* ============================================================================
 *  Purpose: to calculate the outdoor wet bulb-globe temperature, which is 
 *           the weighted sum of the air temperature (dry bulb), the globe temperature, 
 *           and the natural wet bulb temperature: Twbg = 0.1 * Tair + 0.7 * Tnwb + 0.2 * Tg.
 *           The program predicts Tnwb and Tg using meteorological input data then combines
 *           the results to produce Twbg.
 *
 *      Modified 2-Nov-2009: calc_wbgt returns -1 if either subroutines Tg or Tnwb return -9999,
 *	 which signals a failure to converge, probably due to a bad input value; otherwise, calc_wbgt
 *	 returns 0.
 *
 *     Modified 2017: The above return values are passed as the retVal variable in the Object
 *     returned by this function.
 *
 *   If the 2-m wind speed is not available, it is estimated using a wind speed at another level.
 *	
 *  Reference: Liljegren, J. C., R. A. Carhart, P. Lawday, S. Tschopp, and R. Sharp:
 *             Modeling the Wet Bulb Globe Temperature Using Standard Meteorological
 *             Measurements. The Journal of Occupational and Environmental Hygiene, 
 *             vol. 5:10, pp. 645-655, 2008.
 *
 *  Author:  James C. Liljegren 
 *		 Decision and Information Sciences Division
 *		 Argonne National Laboratory
 */
function calc_wbgt(year, month, day, hour, minute, gmt, avg, lat, lon, 
		   solar, cldlyr, pres, Tair, relhum, speed, zspeed, dT, urban) {

    // INPUTS:
    // int year,		// 4-digit, e.g. 2007
    // month,	// month (1-12) or month = 0 implies iday is day of year
    // day,		// day of month or day of year (1-366)
    // hour,		// hour in local standard time (LST)
    // minute,	// minutes past the hour
    // gmt,		// LST-GMT difference, hours (negative in USA)
    // avg,		// averaging time of meteorological inputs, minutes
    // urban;	// select "urban" (1) or "rural" (0) wind speed power law exponent
    // float lat,		// north latitude, decimal
    // lon,		// east longitude, decimal (negative in USA)
    // solar,	// total solar irradiance falling on a horizontal detector, W/m2
    // cldlyr,  //cloud layer type - clear, scattered, broken, overcast
    // pres,		// barometric pressure, mb
    // Tair,		// air (dry bulb) temperature, degC
    // relhum,	// relative humidity, %
    // speed,	// wind speed, m/s
    // zspeed,	// height of wind speed measurement, m
    // dT,  // vertical temperature difference (upper minus lower), degC
    // -------- END INPUTS

    /*   OUTPUTS:
	est_speed,	// estimated speed at reference height, m/s		
	Tg,		// globe temperature, degC				
	Tnwb,	// natural wet bulb temperature, degC				
	Tpsy,	// psychrometric wet bulb temperature, degC			
	Twbg;	// wet bulb globe temperature, degC
	retVal // 0 if everything worked; -1 if there was a problem.
-------- END OUTPUTS   */

    // In the original C code the outputs were passed as pointers.
    // Here we return all of them in a single JavaScript object.
    var outputs = new Object();
    /* 
     *  convert time to GMT and center in avg period;
     */
    var hour_gmt = hour - gmt + ( minute - 0.5 * avg ) / 60; 
    var dday = day + hour_gmt / 24;
    /*
     *  calculate the cosine of the solar zenith angle and 
     * fraction of solar irradiance
     *  due to the direct beam; adjust solar irradiance if it is out of bounds
     */
    var retVar = calc_solar_parameters(year, month, dday, lat, lon, solar);
    var solar = retVar.solarRet; // adjusted solar irradiance if out of bounds
    var cza = retVar.cza; // cosine of solar zenith angle
    var fdir = retVar.fdir; // fraction of solar irradiance due to direct beam
    /* 
     *  estimate the wind speed, if necessary
     */
    var REF_HEIGHT = 2.0; // 2-meter reference height
    if ( zspeed != REF_HEIGHT ) {	
	var daytime;
	if ( cza > 0 ) 
	    daytime = true;
	else
	    daytime = false;
	var stability_class = stab_srdt(daytime, speed, solar, dT);
	outputs.est_speed = est_wind_speed(speed, zspeed, stability_class, urban);
	var speed = outputs.est_speed;
    }
    /*
     *  unit conversions
     */
    var tk = Tair + 273.15; /* degC to kelvin */
    var rh = 0.01 * relhum; /* relative humidity % to fraction  */
    /*
     *  calculate the globe, natural wet bulb, psychrometric wet bulb, and 
     *  outdoor wet bulb globe temperatures
     */
    outputs.Tg   = Tglobe(tk, rh, pres, speed, solar, fdir, cza);
    outputs.Tnwb = Twb(tk, rh, pres, speed, solar, fdir, cza, 1);
    outputs.Tpsy = Twb(tk, rh, pres, speed, solar, fdir, cza, 0);
    outputs.Twbg = 0.1 * Tair + 0.2 * (outputs.Tg) + 0.7 * (outputs.Tnwb); 
    if ( outputs.Tg == -9999 | outputs.Tnwb == -9999 ) {
	// There is a problem.
	outputs.Twbg = -9999;
	outputs.retVal = -1;
    }
    else
	// Everything seemed to work.
	outputs.retVal = 0;
    return(outputs);
}
/* ============================================================================
 * Function calc_solar_parameters:
 *
 *  Purpose: to calculate the cosine solar zenith angle and the fraction of the
 *		 solar irradiance due to the direct beam.
 *	
 *  Author:  James C. Liljegren 
 *		 Decision and Information Sciences Division
 *		 Argonne National Laboratory
 *  Translated to JavaScript by: Aaron Tustin, Occupational Safety and Health Administration
 */ 
function calc_solar_parameters(year, month, day, lat, lon, solar) {
    
  /*  Inputs:
     year,		4-digit year, e.g., 2007						
    month;	 2-digit month; month = 0 implies day = day of year		
     day;		day.fraction of month if month > 0;
			   else day.fraction of year if month = 0 (GMT)			
     lat,		north latitude
     lon,		east latitude (negative in USA)
     solar,	 solar irradiance (W/m2)
		
   Outputs:
     An object containing the following names:
     solarRet,     solar irradiance (W/m2), possibly adjusted by this function.
     cza,	cosine of solar zenith angle	
     fdir;	fraction of solar irradiance due to direct beam
  */
	
    var toasolar, // top-of-atmosphere solar irradiance
	normsolar; 
    
    var days_1900 = 0.0, ap_ra, ap_dec, elev, refr, azim, soldist;

    var sp = {solarRet:solar, cza:0, fdir:0}; // the output object

    // Define some constants
    var SOLAR_CONST = 1367.0,
	DEG_RAD = 0.017453292519943295,
	CZA_MIN = 0.00873,
	NORMSOLAR_MAX = 0.85;
    
    var solarposObj = solarposition(year, month, day, days_1900, lat, lon);
    ap_ra = solarposObj.ap_ra;
    ap_dec = solarposObj.ap_dec;
    elev = solarposObj.altitude;
    refr = solarposObj.refraction;
    azim = solarposObj.azimuth;
    soldist = solarposObj.distance;
    sp.cza = Math.cos( (90 - elev)*DEG_RAD );

    toasolar = SOLAR_CONST * Math.max(0,sp.cza) / (soldist*soldist);

    /* 
     *  if the sun is not fully above the horizon 
     *  set the maximum (top of atmosphere) solar = 0
     */	
    if ( sp.cza < CZA_MIN ) toasolar = 0;
    
    if ( toasolar > 0 ) {
	/*
	 *  account for any solar sensor calibration errors and
	 *  make the solar irradiance consistent with normsolar
	 */
	normsolar = Math.min( solar/toasolar, NORMSOLAR_MAX );
	sp.solarRet = normsolar * toasolar;

	/*
	 *  calculate fraction of the solar irradiance due to the direct beam
	 */
	if ( normsolar > 0. ) {
	    sp.fdir = Math.exp( 3 - 1.34 * normsolar - 1.65 / normsolar );
	    sp.fdir = Math.max(Math.min(sp.fdir, 0.9), 0.0);
	} 
	else {
	    sp.fdir = 0;
        }
    }
    else {
	sp.fdir = 0;
    }    
    
    return(sp);
}
/* ============================================================================
 *  Purpose: to calculate the natural wet bulb temperature.
 *	
 *  Author:  James C. Liljegren 
 *		 Decision and Information Sciences Division
 *		 Argonne National Laboratory
 */

/* Translated to JavaScript in 2017 by Aaron Tustin, OSHA. */
function Twb(Tair, rh, Pair, speed, solar, fdir, cza, rad) {

    // Inputs:
    // float Tair,		/* air (dry bulb) temperature, degC*/
    // rh,   /* relative humidity */
    // Pair,		/* barometric pressure, mb	*/
    // speed,	/* wind speed, m/s	*/
    // solar,	/* solar irradiance, W/m2	*/
    // fdir,		/* fraction of solar irradiance due to direct beam */
    // cza;		/* cosine of solar zenith angle	*/
    // int	rad;	/* switch to enable/disable radiative heating; no radiative heating --> pyschrometric wet bulb temp */

    // Define constants.
    var CONVERGENCE = 0.02,
	MAX_ITER = 50,
	D_WICK = 0.007,
	L_WICK = 0.0254,
	PI = 3.1415926535897932,
	Cp = 1003.5,
	R_GAS = 8314.34,
	M_AIR = 28.97,
	M_H2O = 18.015,
	R_AIR = (R_GAS/M_AIR),
	Pr = (Cp/(Cp+1.25*R_AIR)),
	STEFANB = 5.6696e-8,
	EMIS_SFC = 0.999,
	EMIS_WICK = 0.95,
	ALB_WICK = 0.4,
	ALB_SFC = 0.45,
	RATIO = (Cp*M_AIR/M_H2O);
    
    var a = 0.56; /* from Bedingfield and Drew */
	
    var sza, Tsfc, Tdew, Tref, Twb_prev, Twb_new,
	eair, ewick, density, 
	Sc,	/* Schmidt number */
	h,	/* convective heat transfer coefficient */
	Fatm; /* radiative heating term */
		
    var converged, iter;
	
    Tsfc = Tair;
    sza = Math.acos(cza); /* solar zenith angle, radians */
    eair = rh * esat(Tair,0,Pair);
    Tdew = dew_point(eair,0);
    Twb_prev = Tdew; /* first guess is the dew point temperature */
    converged = false;
    iter = 0;
    do {
	iter++;
	Tref = 0.5*( Twb_prev + Tair );	/* evaluate properties at the average temperature */
	h = h_cylinder_in_air(D_WICK, L_WICK, Tref, Pair, speed);
	Fatm = STEFANB * EMIS_WICK *
	    ( 0.5*( emis_atm(Tair,rh,Pair)*Math.pow(Tair,4.) + EMIS_SFC*Math.pow(Tsfc,4.) ) - Math.pow(Twb_prev,4.) )
	    + (1.-ALB_WICK) * solar *
	    ( (1.-fdir)*(1.+0.25*D_WICK/L_WICK) + fdir*((Math.tan(sza)/PI)+0.25*D_WICK/L_WICK) + ALB_SFC );
	ewick = esat(Twb_prev,0,Pair);
	density = Pair * 100. / (R_AIR * Tref);
	Sc = viscosity(Tref)/(density*diffusivity(Tref,Pair));
	Twb_new = Tair - evap(Tref)/RATIO * (ewick-eair)/(Pair-ewick) * Math.pow(Pr/Sc,a) + (Fatm/h * rad);
	if ( Math.abs(Twb_new-Twb_prev) < CONVERGENCE ) converged = true;
	Twb_prev = 0.9*Twb_prev + 0.1*Twb_new;
    } while (!converged & iter < MAX_ITER);

    if ( converged ) {
	return (Twb_new-273.15);
    }
    else {
	return (-9999.);
    }
}
/* ============================================================================
 * Purpose: to calculate the convective heat transfer coefficient in W/(m2 K)
 *          for a long cylinder in cross flow.
 *
 * Reference: Bedingfield and Drew, eqn 32 
 *
 */

/* Translated to JavaScript in 2017 by Aaron Tustin, OSHA. */
function h_cylinder_in_air(diameter, length, Tair, Pair, speed) {

    // Inputs:
    // float	diameter,	/* cylinder diameter, m	*/
    // length,	/* cylinder length, m	*/
    // Tair,		/* air temperature, K	*/
    // Pair,		/* barometric pressure, mb */
    // speed;	/* fluid (wind) speed, m/s */

    var a = 0.56,  /* parameters from Bedingfield and Drew */
	b = 0.281,
	c = 0.4;
			 
    var density,
	Re,	/* Reynolds number */
	Nu;	/* Nusselt number */

    // Define some constants
    var R_GAS = 8314.34,
	M_AIR = 28.97,
	R_AIR = (R_GAS/M_AIR),
	MIN_SPEED = 0.13,
	Cp = 1003.5,
	Pr = (Cp/(Cp+1.25*R_AIR));
    
    density = Pair * 100. / ( R_AIR * Tair );
    Re = Math.max(speed,MIN_SPEED) * density * diameter / viscosity(Tair);
    Nu = b * Math.pow(Re,(1.-c)) * Math.pow(Pr,(1.-a));
    return( Nu * thermal_cond(Tair) / diameter );
}
/* ============================================================================
 *  Purpose: to calculate the globe temperature.
 *	
 *  Author:  James C. Liljegren 
 *		 Decision and Information Sciences Division
 *		 Argonne National Laboratory
 */

/* Translated into JavaScript in 2017 by Aaron Tustin, OSHA. */
function Tglobe(Tair, rh, Pair, speed, solar, fdir, cza) {

    // Inputs:
    // float Tair,		/* air (dry bulb) temperature, degC */
    // rh,		/* relative humidity, fraction between 0 and 1	*/
    // Pair,		/* barometric pressure, mb */
    // speed,	/* wind speed, m/s */
    // solar,	/* solar irradiance, W/m2 */
    // fdir,	/* fraction of solar irradiance due to direct beam */
    // cza; /* cosine of solar zenith angle */

    // Define some constants:
    var EMIS_GLOBE = 0.95,
	ALB_GLOBE = 0.05,
	ALB_SFC = 0.45,
	D_GLOBE = 0.0508,
	EMIS_SFC = 0.999,
	STEFANB = 5.6696e-8,
	CONVERGENCE = 0.02,
	MAX_ITER = 50;
    
    var Tsfc, Tref, Tglobe_prev, Tglobe_new, h;
		
    var converged, iter;
	
    Tsfc = Tair;
    Tglobe_prev = Tair; /* first guess is the air temperature */
    converged = false;
    iter = 0;
    do {
	iter += 1;
	Tref = 0.5*( Tglobe_prev + Tair );	/* evaluate properties at the average temperature */
	h = h_sphere_in_air(D_GLOBE, Tref, Pair, speed);
	Tglobe_new = Math.pow( 
	    0.5*( emis_atm(Tair,rh,Pair)*Math.pow(Tair,4.) +
		  EMIS_SFC*Math.pow(Tsfc,4.) )
		- h/(STEFANB*EMIS_GLOBE)*(Tglobe_prev - Tair)
		+ solar/(2.*STEFANB*EMIS_GLOBE)*(1.-ALB_GLOBE)*(fdir*(1./(2.*cza)-1.)+1.+ ALB_SFC), 0.25);
	if ( Math.abs(Tglobe_new-Tglobe_prev) < CONVERGENCE ) converged = true;
	Tglobe_prev = 0.9*Tglobe_prev + 0.1*Tglobe_new;
    } while (!converged & iter < MAX_ITER);
    
    if ( converged ) {
	return (Tglobe_new-273.15);
    }
    else {
	return (-9999.);
    }
}
/* ============================================================================
 * Purpose: to calculate the convective heat transfer coefficient, W/(m2 K)
 *          for flow around a sphere.
 *
 * Reference: Bird, Stewart, and Lightfoot (BSL), page 409. 
 *
 */

/* Translated into JavaScript in 2017 by Aaron Tustin, OSHA. */
function h_sphere_in_air(diameter, Tair, Pair, speed) {

    // Inputs:
    // float	diameter,	/* sphere diameter, m	*/
    // Tair,		/* air temperature, K	*/
    // Pair,		/* barometric pressure, mb */
    // speed;	/* fluid (air) speed, m/s	*/

    // Define constants
    var R_GAS = 8314.34,
	M_AIR = 28.97,
	R_AIR = (R_GAS/M_AIR),
	MIN_SPEED = 0.13,
	Cp = 1003.5,
	Pr = (Cp/(Cp + 1.25*R_AIR));
    
    var density,
	Re,	/* Reynolds number */
	Nu;	/* Nusselt number */
		
    density = Pair * 100. / ( R_AIR * Tair );
    Re = Math.max(speed,MIN_SPEED) * density * diameter / viscosity(Tair);
    Nu = 2.0 + 0.6 * Math.sqrt(Re) * Math.pow(Pr,0.3333);
    return( Nu * thermal_cond(Tair) / diameter );
}
/* ============================================================================
 *  Purpose: calculate the saturation vapor pressure (mb) over liquid water
 *           (phase = 0) or ice (phase = 1).
 *
 *  Reference: Buck's (1981) approximation (eqn 3) of Wexler's (1976) formulae.
 */

/* Translated into JavaScript in 2017 by Aaron Tustin, OSHA. */
function esat(tk,phase,pres) {

    // Inputs:
    // float	tk;	/* air temperature, K */
    // int	phase; /* 0 = water, 1 = ice. */

    var y, es;

    if ( phase == 0 ) {	/* over liquid water */
	y = (tk - 273.15)/(tk - 32.18);
	es = 6.1121 * Math.exp( 17.502 * y );
	es = (1.0007 + (3.46E-6 * pres)) * es; /* correction for moist air, if pressure is available */
    } 
    else {			/* over ice */
        y = (tk - 273.15)/(tk - 0.6);
	es = 6.1115 * Math.exp( 22.452 * y );
        es = (1.0003 + (4.18E-6 * pres)) * es; /* correction for moist air, if pressure is available */
    }
	
    //es = 1.004 * es;  /* correction for moist air, if pressure is not available; for pressure > 800 mb */
    //es = 1.0034 * es; /* correction for moist air, if pressure is not available; for pressure down to 200 mb */

    return ( es );
}
/* ============================================================================
 *  Purpose: calculate the dew point (phase=0) or frost point (phase=1) 
 *           temperature, K.
 */

/* Translated into JavaScript in 2017 by Aaron Tustin, OSHA. */
function dew_point(e,phase) {

    // Inputs:
    // float	e;	/* vapor pressure, mb */
    // int	phase; /* 0 for dew point, or 1 for frost point */

    var z, tdk;
	
    if ( phase == 0 ) {	/* dew point */
	z = Math.log( e / (6.1121*1.004) );
	tdk = 273.15 + 240.97*z/(17.502-z);
    }
    else {	            /* frost point */
	z = Math.log( e / (6.1115*1.004) );
	tdk = 273.15 + 272.55*z/(22.452-z);
    }
	
    return(tdk);
}
/* ============================================================================
 *  Purpose: calculate the viscosity of air, kg/(m s)
 *
 *  Reference: BSL, page 23.
 */

/* Translated into JavaScript in 2017 by Aaron Tustin, OSHA. */
function viscosity(Tair) {

    // Input:
    // float	Tair;	/* air temperature, K */

    // Define constants:
    var M_AIR = 28.97;
    
    var sigma = 3.617,
	eps_kappa = 97.0;
			 
    var Tr = Tair / eps_kappa;
    var omega = ( Tr - 2.9 ) / 0.4 * ( -0.034 ) + 1.048;
    return( 2.6693E-6 * Math.sqrt( M_AIR*Tair ) / ( sigma * sigma * omega ) );
}
/* ============================================================================
 *  Purpose: calculate the thermal conductivity of air, W/(m K)
 *
 *  Reference: BSL, page 257.
 */

/* Translated into JavaScript in 2017 by Aaron Tustin, OSHA. */
function thermal_cond(Tair) {

    // Input:
    // Tair;	/* air temperature, K */

    // Define constants.
    var Cp = 1003.5,
	R_GAS = 8314.34,
	M_AIR = 28.97,
	R_AIR = (R_GAS/M_AIR);
	
    return( ( Cp + 1.25 * R_AIR ) * viscosity(Tair) );
}
/* ============================================================================
 *  Purpose: calculate the diffusivity of water vapor in air, m2/s
 *
 *  Reference: BSL, page 505.
 */

/* Translated to JavaScript in 2017 by Aaron Tustin, OSHA. */
function diffusivity(Tair,Pair) {

    // Inputs:
    //float	Tair,	/* Air temperature, K */
    // Pair; /* Barometric pressure, mb */

    // Define constants
    var M_AIR = 28.97,
	M_H2O = 18.015;
    
    var Pcrit_air = 36.4, 
	Pcrit_h2o = 218., 
	Tcrit_air = 132., 
	Tcrit_h2o = 647.3,
	a = 3.640E-4, 
	b = 2.334;
			 
    var Pcrit13  = Math.pow( ( Pcrit_air * Pcrit_h2o ),(1/3) );
    var Tcrit512 = Math.pow( ( Tcrit_air * Tcrit_h2o ),(5/12) );
    var Tcrit12  = Math.sqrt( Tcrit_air * Tcrit_h2o );
    var Mmix = Math.sqrt( 1/M_AIR + 1/M_H2O );
    var Patm = Pair / 1013.25 ; /* convert pressure from mb to atmospheres */
	
    return( a * Math.pow( (Tair/Tcrit12),b) * Pcrit13 * Tcrit512 * Mmix / Patm * 1E-4 );
}
/* ============================================================================
 *  Purpose: calculate the heat of evaporation, J/(kg K), for temperature
 *           in the range 283-313 K.
 *
 *  Reference: Van Wylen and Sonntag, Table A.1.1
 */

/* Translated to JavaScript in 2017 by Aaron Tustin, OSHA. */
function evap(Tair) {

    // Input:
    // float	Tair;	/* air temperature, K */

    return( (313.15 - Tair)/30. * (-71100.) + 2.4073e6 );
}
/* ============================================================================
 *  Purpose: calculate the atmospheric emissivity.
 *
 *  Reference: Oke (2nd edition), page 373.
 */

/* Translated to JavaScript in 2017 by Aaron Tustin, OSHA. */
function emis_atm(Tair, rh, Pair) {

    /* Inputs:
    float	Tair,	// air temperature, K
    rh;	// relative humidity, fraction between 0 and 1 */

    var eee = rh * esat(Tair,0,Pair);
    return( 0.575 * Math.pow(eee, 0.143) );
}
/* ============================================================================
 *  Version 3.0 - February 20, 1992.
 *
 *  solarposition() employs the low precision formulas for the Sun's coordinates
 *  given in the "Astronomical Almanac" of 1990 to compute the Sun's apparent
 *  right ascension, apparent declination, altitude, atmospheric refraction
 *  correction applicable to the altitude, azimuth, and distance from Earth.
 *  The "Astronomical Almanac" (A. A.) states a precision of 0.01 degree for the
 *  apparent coordinates between the years 1950 and 2050, and an accuracy of
 *  0.1 arc minute for refraction at altitudes of at least 15 degrees.
 *
 *  The following assumptions and simplifications are made:
 *  -> refraction is calculated for standard atmosphere pressure and temperature
 *     at sea level.
 *  -> diurnal parallax is ignored, resulting in 0 to 9 arc seconds error in
 *     apparent position.
 *  -> diurnal aberration is also ignored, resulting in 0 to 0.02 second error
 *     in right ascension and 0 to 0.3 arc second error in declination.
 *  -> geodetic site coordinates are used, without correction for polar motion
 *     (maximum amplitude of 0.3 arc second) and local gravity anomalies.
 *  -> local mean sidereal time is substituted for local apparent sidereal time
 *     in computing the local hour angle of the Sun, resulting in an error of
 *     about 0 to 1 second of time as determined explicitly by the equation of
 *     the equinoxes.
 *
 *  Right ascension is measured in hours from 0 to 24, and declination in
 *  degrees from 90 to -90.
 *  Altitude is measured from 0 degrees at the horizon to 90 at the zenith or
 *  -90 at the nadir. Azimuth is measured from 0 to 360 degrees starting at
 *  north and increasing toward the east at 90.
 *  The refraction correction should be added to the altitude if Earth's
 *  atmosphere is to be accounted for.
 *  Solar distance from Earth is in astronomical units, 1 a.u. representing the
 *  mean value.
 *
 *  The necessary input parameters are:
 *  -> the date, specified in one of three ways:
 *       1) year, month, day.fraction
 *       2) year, daynumber.fraction
 *       3) days.fraction elapsed since January 0, 1900.
 *  -> site geodetic (geographic) latitude and longitude.
 *
 *  Refer to the function declaration for the parameter type specifications and
 *  formats.
 *
 *  solarposition() returns -1 if an input parameter is out of bounds, or 0 if
 *  values were written to the locations specified by the output parameters.
 */

/*  Author: Nels Larson
 *          Pacific Northwest National Laboratory
 *          P.O. Box 999
 *          Richland, WA 99352
 *          U.S.A.
 */

/*  Translated from C to JavaScript by Aaron Tustin, OSHA, Washington, DC */
function solarposition(year, month, day, days_1900, latitude, longitude) {

/* Inputs:

int    year,          /* Four digit year (Gregorian calendar).
                       *   [1950 through 2049; 0 o.k. if using days_1900]
       month;         /* Month number.
                       *   [1 through 12; 0 o.k. if using daynumber for day]
double day,           /* Calendar day.fraction, or daynumber.fraction.
                       *   [If month is NOT 0:
                       *      0 through 32; 31st @ 18:10:00 UT = 31.75694
                       *    If month IS 0:
                       *      0 through 367; 366 @ 18:10:00 UT = 366.75694] 
       days_1900,     /* Days since 1900 January 0 @ 00:00:00 UT.
                       *   [18262.0 (1950/01/00) through 54788.0 (2049/12/32);
                       *    1990/01/01 @ 18:10:00 UT = 32873.75694;
                       *    0.0 o.k. if using {year, month, day} or
                       *    {year, daynumber}]
       latitude,      /* Observation site geographic latitude.
                       *   [degrees.fraction, North positive]
       longitude,     /* Observation site geographic longitude.
                       *   [degrees.fraction, East positive]

  Outputs:
 Returns an object containing these variables:

  ap_ra,        /* Apparent solar right ascension.
                       *   [hours; 0.0 <= *ap_ra < 24.0]
  ap_dec,       /* Apparent solar declination.
                       *   [degrees; -90.0 <= *ap_dec <= 90.0]
  altitude,     /* Solar altitude, uncorrected for refraction.
                       *   [degrees; -90.0 <= *altitude <= 90.0]
  refraction,   /* Refraction correction for solar altitude.
                       * Add this to altitude to compensate for refraction.
                       *   [degrees; 0.0 <= *refraction]
  azimuth,      /* Solar azimuth.
                       *   [degrees; 0.0 <= *azimuth < 360.0, East is 90.0]
  distance,     /* Distance of Sun from Earth (heliocentric-geocentric).
                  [astronomical units; 1 a.u. is mean distance] 
  retValue      -1 if input parameters were out of bounds, or 0 if 
                the function worked. */
    

  var daynumber,       /* Sequential daynumber during a year. */
      delta_days,      /* Whole days since 2000 January 0. */
      delta_years,     /* Whole years since 2000. */
      cent_J2000,      /* Julian centuries since epoch J2000.0 at 0h UT. */
      cos_alt,         /* Cosine of the altitude of Sun. */
      cos_apdec,       /* Cosine of the apparent declination of Sun. */
      cos_az,          /* Cosine of the azimuth of Sun. */
      cos_lat,         /* Cosine of the site latitude. */
      cos_lha,         /* Cosine of the local apparent hour angle of Sun. */
      days_J2000,      /* Days since epoch J2000.0. */
      ecliptic_long,   /* Solar ecliptic longitude. */
      lmst,            /* Local mean sidereal time. */
      local_ha,        /* Local mean hour angle of Sun. */
      gmst0h,          /* Greenwich mean sidereal time at 0 hours UT. */
      integral,        /* Integral portion of double precision number. */
      mean_anomaly,    /* Earth mean anomaly. */
      mean_longitude,  /* Solar mean longitude. */
      mean_obliquity,  /* Mean obliquity of the ecliptic. */
      pressure =       /* Earth mean atmospheric pressure at sea level */
      1013.25,       /*   in millibars. */
      sin_apdec,       /* Sine of the apparent declination of Sun. */
      sin_az,          /* Sine of the azimuth of Sun. */
      sin_lat,         /* Sine of the site latitude. */
      tan_alt,         /* Tangent of the altitude of Sun. */
      temp =           /* Earth mean atmospheric temperature at sea level */
      15.0,          /*   in degrees Celsius. */
      ut;              /* UT hours since midnight. */
    
    /* Math definitions. */
    var PI = 3.1415926535897932;
    var TWOPI = 6.2831853071795864;
    var DEG_RAD = 0.017453292519943295; // pi/180
    var RAD_DEG = 57.295779513082323; // 180/pi

    // Create the output Object, and make the default return value be -1:
    var outputs = new Object();
    outputs.retVal = -1;
    
    /* Check latitude and longitude for proper range before calculating dates.
     */
    if (latitude < -90.0 | latitude > 90.0 |
	longitude < -180.0 | longitude > 180.0) {
	return (outputs); // outputs.retVal is -1
    }
	
    /* If year is not zero then assume date is specified by year, month, day.
     * If year is zero then assume date is specified by days_1900.
     */
    if (year != 0) {
	/* Date given by {year, month, day} or {year, 0, daynumber}. */
	if (year < 1950 || year > 2049) {
	    
	    return (outputs); // year is out of bounds; retVal = -1
	}
	if (month != 0) {
	    if (month < 1 | month > 12 | day < 0.0 | day > 33.0) {
		return (outputs); // retVal = -1
            }
	    
	    daynumber = daynum(year, month, Math.floor(day));
	}
	else {
	    if (day < 0.0 | day > 368.0) {
		return (outputs); // retVal is still -1
            }
	    
	    daynumber = Math.floor(day);
	}
	
	/* Construct Julian centuries since J2000 at 0 hours UT of date,
	 * days.fraction since J2000, and UT hours.
	 */
	delta_years = year - 2000;
	/* delta_days is days from 2000/01/00 (1900's are negative). */
	delta_days = Math.floor(delta_years * 365 + delta_years / 4 + daynumber);
	if (year > 2000) {
	    delta_days = delta_days + 1;
        }
	/* J2000 is 2000/01/01.5 */
	days_J2000 = delta_days - 1.5;
	
	cent_J2000 = days_J2000 / 36525.0;
	
	integral = Math.floor(day);
	ut = day - integral;

	days_J2000 += ut;
	ut *= 24.0;
    }
    else {
	/* Date given by days_1900. */

	/* days_1900 is 18262 for 1950/01/00, and 54788 for 2049/12/32.
	 * A. A. 1990, K2-K4. */
	if (days_1900 < 18262.0 | days_1900 > 54788.0) {
	    return (outputs); // retVal is still -1
        }

	/* Construct days.fraction since J2000, UT hours, and
	 * Julian centuries since J2000 at 0 hours UT of date.
	 */
	/* days_1900 is 36524 for 2000/01/00. J2000 is 2000/01/01.5 */
	days_J2000 = days_1900 - 36525.5;

	// ut = modf(days_1900, &integral) * 24.0; // old C language version
	integral = Math.floor(days_1900);
	ut = (days_1900 - integral) * 24;
	
	cent_J2000 = (integral - 36525.5) / 36525.0;
    }


    /* Compute solar position parameters.
     * A. A. 1990, C24.
     */
    
    mean_anomaly = (357.528 + 0.9856003 * days_J2000);
    mean_longitude = (280.460 + 0.9856474 * days_J2000);
    /* Put mean_anomaly and mean_longitude in the range 0 -> 2 pi. */
    // mean_anomaly = modf(mean_anomaly / 360.0, &integral) * TWOPI; // old C version
    integral = Math.floor(mean_anomaly / 360.0);
    mean_anomaly = (mean_anomaly / 360.0 - integral) * TWOPI;
    //mean_longitude = modf(mean_longitude / 360.0, &integral) * TWOPI; // old C version
    integral = Math.floor(mean_longitude / 360.0);
    mean_longitude = (mean_longitude / 360.0 - integral) * TWOPI;

    mean_obliquity = (23.439 - 4.0e-7 * days_J2000) * DEG_RAD;
    ecliptic_long = ((1.915 * Math.sin(mean_anomaly)) +
                     (0.020 * Math.sin(2.0 * mean_anomaly))) * DEG_RAD +
        mean_longitude;

    outputs.distance = 1.00014 - 0.01671 * Math.cos(mean_anomaly) -
        0.00014 * Math.cos(2.0 * mean_anomaly);
    /* Tangent of ecliptic_long separated into sine and cosine parts for ap_ra. */
    outputs.ap_ra = Math.atan2(Math.cos(mean_obliquity) * Math.sin(ecliptic_long), Math.cos(ecliptic_long));

    /* Change range of ap_ra from -pi -> pi to 0 -> 2 pi. */
    if (outputs.ap_ra < 0.0) {
	outputs.ap_ra += TWOPI;
    }
    /* Put ap_ra in the range 0 -> 24 hours. */
    //outputs.ap_ra = modf(*ap_ra / TWOPI, &integral) * 24.0; // old C version
    integral = Math.floor(outputs.ap_ra / TWOPI);
    outputs.ap_ra = (outputs.ap_ra / TWOPI - integral) * 24.0;
    
    outputs.ap_dec = Math.asin(Math.sin(mean_obliquity) * Math.sin(ecliptic_long));
    
    /* Calculate local mean sidereal time.
     * A. A. 1990, B6-B7.
     */

    /* Horner's method of polynomial exponent expansion used for gmst0h. */
    gmst0h = 24110.54841 + cent_J2000 * (8640184.812866 + cent_J2000 *
					 (0.093104 - cent_J2000 * 6.2e-6));
    /* Convert gmst0h from seconds to hours and put in the range 0 -> 24. */
    //gmst0h = modf(gmst0h / 3600.0 / 24.0, &integral) * 24.0;
    integral = Math.floor(gmst0h/3600/24);
    if (integral < 0) integral += 1; // to match behavior of C modf() when dealing with negative numbers
    gmst0h = (gmst0h/3600/24 - integral) * 24;
    
    
    if (gmst0h < 0.0) {
	gmst0h += 24.0;
    }

    /* Ratio of lengths of mean solar day to mean sidereal day is 1.00273790934
     * in 1990. Change in sidereal day length is < 0.001 second over a century.
     * A. A. 1990, B6.
     */
    lmst = gmst0h + (ut * 1.00273790934) + longitude / 15.0;
    /* Put lmst in the range 0 -> 24 hours. */
    //lmst = modf(lmst / 24.0, &integral) * 24.0;
    integral = Math.floor(lmst/24);
    if (integral < 0) integral += 1; // to match behavior of C modf()
    lmst = (lmst/24 - integral) * 24;
    
    if (lmst < 0.0) {
	lmst += 24.0;
    }

    /* Calculate local hour angle, altitude, azimuth, and refraction correction.
     * A. A. 1990, B61-B62.
     */

    local_ha = lmst - outputs.ap_ra;
    /* Put hour angle in the range -12 to 12 hours. */
    if (local_ha < -12.0) {
	local_ha += 24.0;
    }
    else if (local_ha > 12.0) {
	local_ha -= 24.0;
    }

    /* Convert latitude and local_ha to radians. */
    var latitude = latitude * DEG_RAD;
    local_ha = local_ha / 24.0 * TWOPI;

    cos_apdec = Math.cos(outputs.ap_dec);
    sin_apdec = Math.sin(outputs.ap_dec);
    cos_lat = Math.cos(latitude);
    sin_lat = Math.sin(latitude);
    cos_lha = Math.cos(local_ha);

    outputs.altitude = Math.asin(sin_apdec * sin_lat + cos_apdec * cos_lha * cos_lat);

    cos_alt = Math.cos(outputs.altitude);
    /* Avoid tangent overflow at altitudes of +-90 degrees.
     * 1.57079615 radians is equal to 89.99999 degrees.
     */
    if (Math.abs(outputs.altitude) < 1.57079615) {
	tan_alt = Math.tan(outputs.altitude);
    }
    else {
	tan_alt = 6.0e6;
    }

    cos_az = (sin_apdec * cos_lat - cos_apdec * cos_lha * sin_lat) / cos_alt;
    sin_az = -(cos_apdec * Math.sin(local_ha) / cos_alt);
    outputs.azimuth = Math.acos(cos_az);

    /* Change range of azimuth from 0 -> pi to 0 -> 2 pi. */
    if (Math.atan2(sin_az, cos_az) < 0.0) {
	outputs.azimuth = TWOPI - outputs.azimuth;
    }

    /* Convert ap_dec, altitude, and azimuth to degrees. */
    outputs.ap_dec *= RAD_DEG;
    outputs.altitude *= RAD_DEG;
    outputs.azimuth *= RAD_DEG;

    /* Compute refraction correction to be added to altitude to obtain actual
     * position.
     * Refraction calculated for altitudes of -1 degree or more allows for a
     * pressure of 1040 mb and temperature of -22 C. Lower pressure and higher
     * temperature combinations yield less than 1 degree refraction.
     * NOTE:
     * The two equations listed in the A. A. have a crossover altitude of
     * 19.225 degrees at standard temperature and pressure. This crossover point
     * is used instead of 15 degrees altitude so that refraction is smooth over
     * the entire range of altitudes. The maximum residual error introduced by
     * this smoothing is 3.6 arc seconds at 15 degrees. Temperature or pressure
     * other than standard will shift the crossover altitude and change the error.
     */
    if (outputs.altitude < -1.0 | tan_alt == 6.0e6) {
	outputs.refraction = 0.0;
    }
    else {
	if (outputs.altitude < 19.225) {
	    outputs.refraction = (0.1594 + (outputs.altitude) * (0.0196 + 0.00002 * (outputs.altitude))) * pressure;
	    outputs.refraction /= (1.0 + (outputs.altitude) * (0.505 + 0.0845 * (outputs.altitude))) * (273.0 + temp);
	}
	else {
	    outputs.refraction = 0.00452 * (pressure / (273.0 + temp)) / tan_alt;
        }
    }

    /* 
     *  to match Michalsky's sunae program, the following line was inserted
     *  by JC Liljegren to add the refraction correction to the solar altitude
     */
    outputs.altitude = outputs.altitude + outputs.refraction;

    // If we made it here, everything worked.
    outputs.retVal = 0;
    return (outputs);
}
/* ============================================================================
 * 'daynum()' returns the sequential daynumber of a calendar date during a
 *  Gregorian calendar year (for years 1 onward).
 *  The integer arguments are the four-digit year, the month number, and
 *  the day of month number.
 *  (Jan. 1 = 01/01 = 001; Dec. 31 = 12/31 = 365 or 366.)
 *  A value of -1 is returned if the year is out of bounds.
 */

/* Author: Nels Larson
 *         Pacific Northwest Lab.
 *         P.O. Box 999
 *         Richland, WA 99352
 *         U.S.A.
 */

/* Translated from C to JavaScript by Aaron Tustin, OSHA, Washington, DC */
function daynum(year, month, day) {

    var begmonth = [0,0,31,59,90,120,151,181,212,243,273,304,334];
    var leapyr = 0;

    /* There is no year 0 in the Gregorian calendar and the leap year cycle
     * changes for earlier years. */
    if (year < 1) {
	return (-1);
    }

    /* Leap years are divisible by 4, except for centurial years not divisible
     * by 400. */
    if (((year%4) == 0 & (year%100) != 0) | (year%400) == 0) {
	leapyr = 1;
    }

    var dnum = begmonth[month] + day; // TO DO: This line will have to change if JavaScript array indices start at 1 rather than 0
    if ((leapyr == 1) & (month > 2)) {
	dnum = dnum + 1;
    }
    return (dnum);
}
/* ============================================================================
 *  Purpose: estimate 2-m wind speed for all stability conditions
 *
 *  Reference: EPA-454/5-99-005, 2000, section 6.2.5
 *
 *  Modified in 2017 by Aaron Tustin, OSHA, Washington, DC
 */
function est_wind_speed(speed, zspeed, stability_class, urban) {

    /* INPUTS:
       int	stability_class,
       urban;
	
       float	speed,
       zspeed;
    */

    // Define constants:
    var MIN_SPEED = 1*1609.34/60/60, //min wind speed of 1 mph for worker movement
        REF_HEIGHT = 2.0;
    
    var urban_exp = [ 0.15, 0.15, 0.20, 0.25, 0.30, 0.30 ],
	rural_exp = [ 0.07, 0.07, 0.10, 0.15, 0.35, 0.55 ],
	exponent;
		
    if ( urban ) {
        exponent = urban_exp[stability_class-1];
    }
    else {
        exponent = rural_exp[stability_class-1];
    }
	
    var est_speed = speed * Math.pow( REF_HEIGHT/zspeed, exponent );
    est_speed = Math.max( est_speed, MIN_SPEED );
    return (est_speed);
}
/* ============================================================================
 *  Purpose: estimate the stability class
 *
 *  Reference: EPA-454/5-99-005, 2000, section 6.2.5
 *
 *  Modified in 2017 by Aaron Tustin, OSHA, Washington, DC
 */
function stab_srdt(daytime, speed, solar, dT) {

    /* Inputs:
       int	daytime;
       float	speed,
       solar,
       dT;
    */
    
    var lsrdt = [
	[1, 1, 2, 4, 0, 5, 6, 0],
	[1, 2, 3, 4, 0, 5, 6, 0],
	[2, 2, 3, 4, 0, 4, 4, 0],
	[3, 3, 4, 4, 0, 0, 0, 0],
	[3, 4, 4, 4, 0, 0, 0, 0],
	[0, 0, 0, 0, 0, 0, 0, 0]
    ];
			
    var i,j;
	
    if ( daytime ) {
	if ( solar >= 925.0 )
	    j = 0;
	else if ( solar >= 675.0 )
	    j = 1;
	else if ( solar >= 175.0 )
	    j = 2;
	else
	    j = 3;
	
	if ( speed >= 6.0 ) 
	    i = 4;
	else if ( speed >= 5.0 )
	    i = 3;
	else if ( speed >= 3.0 )
	    i = 2;
	else if ( speed >= 2.0 )
	    i = 1;
	else
	    i = 0;
    }
    else {
	// not daytime
	if ( dT >= 0.0 )
	    j = 6;
	else
	    j = 5;
	
	if ( speed >= 2.5 )
	    i = 2;
	else if ( speed >= 2.0 )
	    i = 1;
	else
	    i = 0;
    }
    return ( lsrdt[i][j] );
}
/* The following function came from the NOAA/NWS online Heat Index Calculator
(http://www.wpc.ncep.noaa.gov/html/heatindex.shtml) */

    
// Heat index computed using air temperature (F) and RH (%).
// Returns the Heat Index in degrees F.
function heat1(tempair, RHumidity) {
    
    if(RHumidity > 100){
        alert("Relative humidity cannot exceed 100%.");
    }
    else if (RHumidity < 0) {
        alert("Relative humidity cannot be less than 0%.");
    }
    else if (tempair <= 40.0) {
        var hi = tempair;
    }
    else {
        var hitemp = 61.0+((tempair-68.0)*1.2)+(RHumidity*0.094);
        var fptemp = parseFloat(tempair);
        var hifinal = 0.5*(fptemp+hitemp);

        if (hifinal > 79.0) {
            var hi = -42.379+2.04901523*tempair+10.14333127*RHumidity-0.22475541*tempair*RHumidity-6.83783*(Math.pow(10, -3))*(Math.pow(tempair, 2))-5.481717*(Math.pow(10, -2))*(Math.pow(RHumidity, 2))+1.22874*(Math.pow(10, -3))*(Math.pow(tempair, 2))*RHumidity+8.5282*(Math.pow(10, -4))*tempair*(Math.pow(RHumidity, 2))-1.99*(Math.pow(10, -6))*(Math.pow(tempair, 2))*(Math.pow(RHumidity,2));
            if ((RHumidity <= 13) && (tempair >= 80.0) && (tempair <= 112.0)) {
                var adj1 = (13.0-RHumidity)/4.0;
                var adj2 = Math.sqrt((17.0-Math.abs(tempair-95.0))/17.0);
                var adj = adj1 * adj2;
                var hi = hi - adj;
            }
            else if ((RHumidity > 85.0) && (tempair >= 80.0) && (tempair <= 87.0)) {
                var adj1 = (RHumidity-85.0)/10.0;
                var adj2 = (87.0-tempair)/5.0;
                var adj = adj1 * adj2;
                var hi = hi + adj;
            }
        }
        else {
            var hi = hifinal;
        }
    }

    return(hi);

    //var tempc2 = (tempair - 32) * .556;
    //var rh2 = 1 - RHumidity/100;
    //var tdpc2 = tempc2 - (((14.55 + .114*tempc2)*rh2) + (Math.pow(((2.5 + .007*tempc2)*rh2), 3)) + ((15.9 + .117*tempc2))*(Math.pow(rh2, 14)));
   
}

export {calc_wbgt, calc_solar_parameters, clearSkyIrradiance};
